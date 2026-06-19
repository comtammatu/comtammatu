"use server";

import { z } from "zod";
import { randomUUID as _randomUUID } from "crypto";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  BUYER_NOT_GET_INVOICE_NAME,
  getInvoiceProvider,
} from "@comtammatu/shared/providers";
import { resolveSalesTaxProfile } from "@comtammatu/shared/tax";
import {
  applyInvoiceLineDiscount,
  buildInvoiceLineItemsFromOrderItems,
} from "@comtammatu/shared/hddt";
import { ensureInvoiceProviderRegistered } from "@lib/invoice-provider-init";
import { estimateAnnualRevenue } from "@lib/estimate-annual-revenue";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { canAccessBranch } from "@/_lib/branch-scope";
import { logAudit } from "@/_lib/audit";

const FINANCE_ROLES: readonly StaffRole[] = ["owner"];
const INVOICE_CREATE_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
  "cashier",
  "waiter",
];
const REPORT_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
];

/* ─── HĐĐT: Create Invoice ─── */

const MST_REGEX = /^\d{10}(-\d{3})?$/;

const createInvoiceSchema = z
  .object({
    orderId: z.coerce.number().int().positive(),
    buyerName: z.string().trim().max(200).optional(),
    buyerTaxCode: z
      .string()
      .trim()
      .regex(MST_REGEX, { error: "MST phải có dạng 10 số hoặc 10-3 số" })
      .optional(),
    buyerAddress: z.string().trim().max(500).optional(),
    buyerNotGetInvoice: z.boolean().optional(),
  })
  .refine((v) => !v.buyerTaxCode || (v.buyerName && v.buyerName.length > 0), {
    error: "Có MST thì phải nhập tên người mua",
    path: ["buyerName"],
  });

/**
 * Create a draft tax invoice for an order.
 * Production HĐĐT issuance uses Viettel S-invoice. When provider credentials
 * are missing, the invoice remains draft for Finance recovery.
 */
export async function createTaxInvoice(
  input: z.infer<typeof createInvoiceSchema>,
): Promise<ActionResult> {
  const parsed = createInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    INVOICE_CREATE_ROLES,
    PERMISSION_KEYS.ORDERS_WRITE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims, user } = ctx;

  // Fetch order with line items — must be paid. order_items.vat_rate is
  // the per-line snapshot populated at INSERT time by trigger
  // trg_order_items_populate_vat_rate (migration 20260509000000) — needed
  // for correct mixed-rate aggregation per rule VAT-PER-LINE-NOT-PER-INVOICE.
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(
      "id, branch_id, subtotal, tax_amount, total_amount, discount_amount, order_discount_amount, payment_status, order_items(id, item_name, variant_name, quantity, unit_price, subtotal, discount_amount, modifiers, sides, status, vat_rate)",
    )
    .eq("id", parsed.data.orderId)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (orderErr || !order) {
    return { success: false, error: "Đơn hàng không tồn tại." };
  }

  if (order.payment_status !== "paid") {
    return {
      success: false,
      error: "Đơn hàng chưa thanh toán. Không thể xuất hóa đơn.",
    };
  }

  // Branch scope check.
  if (!(await canAccessBranch(supabase, claims, order.branch_id))) {
    return {
      success: false,
      error: "Không có quyền xuất hóa đơn cho chi nhánh này.",
    };
  }

  // Check no existing active invoice for this order. Older `not_required`
  // rows do NOT count as active so we can issue the legally required HĐĐT
  // for orders that were paid before the mandatory-per-payment correction.
  //
  // A provider-rejected attempt is persisted as status='draft' with no
  // invoice_number. It must be retryable after config/payload fixes; reuse the
  // same row so the active-per-order unique slot remains stable.
  const { data: existing } = await supabase
    .from("tax_invoices")
    .select("id, status, invoice_number")
    .eq("order_id", parsed.data.orderId)
    .eq("tenant_id", claims.tenant_id)
    .not("status", "in", '("cancelled","replaced","not_required")')
    .maybeSingle();

  const retryDraftInvoiceId =
    existing?.status === "draft" && !existing.invoice_number
      ? existing.id
      : null;

  if (existing && !retryDraftInvoiceId) {
    return { success: false, error: "Đơn hàng đã có hóa đơn." };
  }

  // Rule HDDT-LATE-B2B-REQUEST-AFTER-BATCH-BLOCKED: an order already folded
  // into a B2C daily-summary HĐ (TT 78/2021 §11.4) must NOT also receive a
  // per-order B2B invoice — that double-issues the same revenue. The per-order
  // check above only scans tax_invoices.order_id; on a summary row order_id is
  // NULL and the order is linked through the tax_invoice_orders junction, so it
  // needs its own JOIN. "Active" = the summary invoice is not cancelled/replaced
  // (a cancelled batch may be re-created, freeing the order again).
  const { data: summaryLinks } = await supabase
    .from("tax_invoice_orders")
    .select("tax_invoices(summary_date, status)")
    .eq("order_id", parsed.data.orderId)
    .eq("tenant_id", claims.tenant_id);

  const summaryInvoice = (summaryLinks ?? [])
    .map(
      (l) =>
        l.tax_invoices as unknown as {
          summary_date: string | null;
          status: string;
        } | null,
    )
    .find(
      (inv) => inv != null && !["cancelled", "replaced"].includes(inv.status),
    );

  if (summaryInvoice) {
    const d = summaryInvoice.summary_date;
    const dateLabel = d
      ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
      : "trước đó";
    return {
      success: false,
      error: `Đơn này đã nằm trong hóa đơn tổng hợp ngày ${dateLabel}. Vui lòng giữ biên nhận hoặc yêu cầu hóa đơn điều chỉnh qua kế toán.`,
    };
  }

  // Per-line VAT aggregation (rule VAT-PER-LINE-NOT-PER-INVOICE).
  // Each order_item carries its own vat_rate snapshot. For uniform-rate
  // orders this is mathematically equivalent to the previous
  // `total / (1 + system_rate)` formula; for mixed-rate orders
  // (food 8% + beer 10%) it produces the correct subtotal/VAT breakdown
  // that the previous single-rate division could not.
  const activeItems = order.order_items.filter(
    (item) => item.status !== "cancelled",
  );
  const orderTotal = Number(order.total_amount);
  const itemGrossSum = activeItems.reduce((s, i) => s + Number(i.subtotal), 0);

  let subtotal: number;
  let vatAmount: number;
  let vatRate: number;

  if (activeItems.length > 0 && itemGrossSum > 0) {
    // Scale absorbs order-level discount: sum of items.subtotal is
    // pre-discount, order.total_amount is post-discount. Discount allocated
    // proportionally across lines at the same rate.
    const scale = orderTotal / itemGrossSum;
    const grossByRate = new Map<number, number>();
    for (const item of activeItems) {
      const rate = Number(item.vat_rate);
      const gross = Number(item.subtotal) * scale;
      grossByRate.set(rate, (grossByRate.get(rate) ?? 0) + gross);
    }

    let sumSub = 0;
    let sumVat = 0;
    let predRate = 0;
    let predGross = -1;
    for (const [rate, gross] of grossByRate) {
      const lineSub = gross / (1 + rate / 100);
      const lineVat = gross - lineSub;
      sumSub += lineSub;
      sumVat += lineVat;
      if (gross > predGross) {
        predRate = rate;
        predGross = gross;
      }
    }
    subtotal = sumSub;
    vatAmount = sumVat;
    // Header rate = predominant by gross weight. For mixed-rate orders
    // (grossByRate.size > 1) this is informational; UI can flag mixed.
    vatRate = predRate;
  } else {
    // Edge: no active items or zero subtotal. Derive the header rate from the
    // HKD revenue-tier GTGT resolver (annual-revenue group) so the
    // draft/failure row has a sensible rate consistent with the per-line snapshot.
    vatRate = resolveSalesTaxProfile({
      annualRevenue: await estimateAnnualRevenue(supabase, claims.tenant_id),
      effectiveDate: new Date(),
    }).gtgtRate;
    subtotal = vatRate > 0 ? orderTotal / (1 + vatRate / 100) : orderTotal;
    vatAmount = orderTotal - subtotal;
  }

  const buyerTaxCode = parsed.data.buyerTaxCode?.trim() || undefined;
  const buyerAddress = parsed.data.buyerAddress?.trim() || undefined;
  const buyerNotGetInvoice =
    parsed.data.buyerNotGetInvoice === true ||
    (!buyerTaxCode && !parsed.data.buyerName?.trim());
  const buyerName = parsed.data.buyerName?.trim() || BUYER_NOT_GET_INVOICE_NAME;

  // Use provider interface — runtime registers Viettel S-invoice only.
  ensureInvoiceProviderRegistered();
  const invoiceProvider = getInvoiceProvider();

  let invoiceNumber: string | null;
  let providerRef: string | null;
  let invoiceStatus: "draft" | "signing" | "submitted" | "issued";
  let providerData: Record<string, unknown> | undefined;

  // activeItems already computed above for VAT aggregation; the empty-
  // items check still applies here (provider payload cannot have zero lines).
  if (activeItems.length === 0) {
    return {
      success: false,
      error: "Đơn hàng không có món nào để xuất hóa đơn.",
    };
  }

  const invoiceItems = applyInvoiceLineDiscount(
    buildInvoiceLineItemsFromOrderItems(activeItems),
    Number(order.order_discount_amount ?? order.discount_amount ?? 0),
  );

  if (invoiceProvider) {
    const result = await invoiceProvider.createInvoice({
      orderId: parsed.data.orderId,
      orderNumber: `ORD-${parsed.data.orderId}`,
      sellerName: "",
      sellerTaxCode: process.env["COMPANY_TAX_CODE"] ?? "",
      sellerAddress: "",
      buyerName,
      buyerTaxCode,
      buyerAddress,
      buyerNotGetInvoice,
      items: invoiceItems,
      subtotal: Math.round(subtotal * 100) / 100,
      vatRate,
      vatAmount: Math.round(vatAmount * 100) / 100,
      totalAmount: Number(order.total_amount),
    });
    invoiceNumber = result.invoiceNumber;
    providerRef = result.providerRef;
    invoiceStatus = result.status === "failed" ? "draft" : result.status;
    providerData = result.providerData;
  } else {
    // No provider configured — create as draft with unique ID
    invoiceNumber = `DRAFT-${order.branch_id}-${crypto.randomUUID().slice(0, 8)}`;
    providerRef = invoiceNumber;
    invoiceStatus = "draft";
    providerData = undefined;
  }

  const stateTimestamp = new Date().toISOString();
  const hasProviderSubmission =
    invoiceStatus === "signing" ||
    invoiceStatus === "submitted" ||
    invoiceStatus === "issued";

  const invoiceWrite = {
    tenant_id: claims.tenant_id,
    branch_id: order.branch_id,
    order_id: parsed.data.orderId,
    invoice_number: invoiceNumber,
    status: invoiceStatus,
    buyer_name: buyerName,
    buyer_tax_code: buyerTaxCode ?? null,
    buyer_address: buyerAddress ?? null,
    subtotal: Math.round(subtotal * 100) / 100,
    vat_rate: vatRate,
    vat_amount: Math.round(vatAmount * 100) / 100,
    total_amount: Number(order.total_amount),
    provider: invoiceProvider?.name ?? "viettel",
    provider_ref: providerRef,
    provider_data: providerData
      ? JSON.parse(JSON.stringify(providerData))
      : null,
    signing_started_at: hasProviderSubmission ? stateTimestamp : null,
    issued_at: invoiceStatus === "issued" ? stateTimestamp : null,
  };

  const invoiceMutation = retryDraftInvoiceId
    ? supabase
        .from("tax_invoices")
        .update(invoiceWrite)
        .eq("id", retryDraftInvoiceId)
        .eq("tenant_id", claims.tenant_id)
        .eq("status", "draft")
    : supabase.from("tax_invoices").insert({
        ...invoiceWrite,
        created_by: user.id,
      });

  const { data: invoice, error: insertErr } = await invoiceMutation
    .select("id, invoice_number, status")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      // UNIQUE partial idx uq_tax_invoices_active_per_order — concurrent
      // double-click slipped past the maybeSingle() pre-check above.
      return { success: false, error: "Đơn hàng đã có hóa đơn." };
    }
    return { success: false, error: "Không thể tạo hóa đơn." };
  }

  await logAudit(supabase, {
    action: "create",
    entityType: "tax_invoice",
    entityId: invoice?.id ?? null,
    newData: { invoice_number: invoice?.invoice_number, status: invoiceStatus },
  });

  return { success: true, data: invoice };
}

/* ─── HĐĐT: Bulk re-issue provider-rejected drafts ─── */

const REISSUE_ALL_CAP = 20;
const REISSUE_ALL_BUDGET_MS = 40_000;

/**
 * Bulk-reissue draft invoices (status='draft' with no invoice_number — i.e.
 * provider-rejected attempts) by reusing createTaxInvoice per order. Bounded by
 * a cap + budget timer to stay within the function limit; the trailing count
 * reports how many drafts remain so the caller re-runs for the rest. Each
 * createTaxInvoice re-checks auth + branch scope + per-order idempotency
 * (deterministic transactionUuid + active-per-order unique slot), so re-running
 * is safe. User-facing copy lives in the caller's messages catalog.
 */
export async function reissueAllDraftInvoices(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) return { success: false, errorCode: "forbidden" };

  const { supabase, claims } = ctx;

  const { data: drafts, error } = await supabase
    .from("tax_invoices")
    .select("id, order_id, buyer_name, buyer_tax_code")
    .eq("tenant_id", claims.tenant_id)
    .eq("status", "draft")
    .is("invoice_number", null)
    .not("order_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(REISSUE_ALL_CAP);

  if (error) return { success: false, errorCode: "load_failed" };

  let issued = 0;
  let failed = 0;
  const startedAt = Date.now();
  for (const draft of drafts ?? []) {
    if (Date.now() - startedAt > REISSUE_ALL_BUDGET_MS) break;
    if (draft.order_id == null) continue;
    const result = await createTaxInvoice({
      orderId: draft.order_id,
      buyerName: draft.buyer_name ?? undefined,
      buyerTaxCode: draft.buyer_tax_code ?? undefined,
    });
    if (result.success) issued += 1;
    else failed += 1;
  }

  const { count: remaining } = await supabase
    .from("tax_invoices")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", claims.tenant_id)
    .eq("status", "draft")
    .is("invoice_number", null)
    .not("order_id", "is", null);

  return {
    success: true,
    data: { issued, failed, remaining: remaining ?? 0 },
  };
}

/* ─── Cancel Invoice ─── */

const cancelInvoiceSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  reason: z
    .string()
    .trim()
    .min(20, "Lý do hủy phải có ít nhất 20 ký tự")
    .max(500, "Lý do hủy quá dài"),
});

// NĐ70/2025 (and earlier 13/2023) requires every HĐĐT cancellation to
// carry a real, descriptive reason. Reason is REQUIRED — never default
// to a placeholder like "Hủy theo yêu cầu" (15 chars, tells auditor
// nothing).
export async function cancelTaxInvoice(
  invoiceId: number,
  reason: string,
): Promise<ActionResult> {
  const parsed = cancelInvoiceSchema.safeParse({ invoiceId, reason });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) return { success: false, error: "Không có quyền hủy hóa đơn." };

  const { supabase, claims } = ctx;

  const { data: invoice, error: fetchErr } = await supabase
    .from("tax_invoices")
    .select("id, status, provider_ref, provider")
    .eq("id", parsed.data.invoiceId)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (fetchErr || !invoice) {
    return { success: false, error: "Hóa đơn không tồn tại." };
  }

  if (invoice.status !== "issued") {
    return { success: false, error: "Chỉ có thể hủy hóa đơn đã phát hành." };
  }

  const cancelReason = parsed.data.reason;

  // DB transition runs FIRST so that the app's source of truth flips
  // atomically to 'cancelled'. Provider cancel runs after — if it fails,
  // we surface a soft warning and rely on Finance to retry the provider
  // call asynchronously (DB is already cancelled, no asymmetric "provider
  // cancelled but DB issued" state).
  const { error: rpcErr } = await supabase.rpc("transition_tax_invoice_state", {
    p_tax_invoice_id: parsed.data.invoiceId,
    p_to_status: "cancelled",
    p_payload: { cancel_reason: cancelReason },
    p_note: cancelReason,
  });

  if (rpcErr) {
    if (rpcErr.code === "22023") {
      return {
        success: false,
        error: "Trạng thái hóa đơn không cho phép hủy.",
      };
    }
    if (rpcErr.code === "42501") {
      return { success: false, error: "Không có quyền hủy hóa đơn." };
    }
    return { success: false, error: "Không thể hủy hóa đơn." };
  }

  let providerCancelWarning: string | null = null;
  if (invoice.provider_ref && invoice.provider === "viettel") {
    ensureInvoiceProviderRegistered();
    const invoiceProvider = getInvoiceProvider();
    if (invoiceProvider) {
      try {
        await invoiceProvider.cancelInvoice(invoice.provider_ref, cancelReason);
      } catch {
        providerCancelWarning =
          "Hóa đơn đã hủy trong hệ thống — sẽ thử hủy lại phía nhà cung cấp.";
      }
    }
  }

  await logAudit(supabase, {
    action: "cancel",
    entityType: "tax_invoice",
    entityId: parsed.data.invoiceId,
    oldData: { status: "issued" },
    newData: {
      status: "cancelled",
      reason: cancelReason,
      provider_cancel_warning: providerCancelWarning,
    },
  });

  return {
    success: true,
    data: providerCancelWarning ? { warning: providerCancelWarning } : null,
  };
}

/* ─── Fetch Invoices ─── */

// order_number is resolved in a second query (see fetchTaxInvoicesPage), not a
// PostgREST embed: embedding `orders(order_number)` joins tax_invoices ⋈ orders,
// and since both tables' RLS policies reference a bare `branch_id`, the generated
// query fails with 42702 "column reference branch_id is ambiguous".
const TAX_INVOICE_LIST_SELECT = `
  id, order_id, invoice_number, status, buyer_name, buyer_tax_code,
  subtotal, vat_rate, vat_amount, total_amount,
  issued_at, cancelled_at, archived_at, created_at
` as const;

const TAX_INVOICE_PAGE_SIZE = 50;

export interface TaxInvoiceCursor {
  createdAt: string;
  id: number;
}

export interface TaxInvoicePage {
  items: unknown[];
  hasMore: boolean;
  nextCursor: TaxInvoiceCursor | null;
}

const taxInvoiceCursorSchema = z.object({
  createdAt: z.string(),
  id: z.coerce.number().int().positive(),
});

const fetchTaxInvoicesPaginatedSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  before: taxInvoiceCursorSchema.optional(),
  pageSize: z.coerce
    .number()
    .int()
    .positive()
    .max(200)
    .optional()
    .default(TAX_INVOICE_PAGE_SIZE),
});

/**
 * Keyset-paginated tax-invoice list (created_at desc, id desc tiebreaker).
 * Mirrors fetchArchivedOrders: fetch pageSize+1 to probe hasMore without a
 * count round-trip, slice to pageSize, expose the last row as nextCursor.
 * Same tenant + optional branch scope (tenant_id + branch_id).
 */
export async function fetchTaxInvoicesPage(
  input: z.input<typeof fetchTaxInvoicesPaginatedSchema> = {},
): Promise<ActionResult<TaxInvoicePage>> {
  const parsed = fetchTaxInvoicesPaginatedSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Tham số tải hóa đơn không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  const { branchId, before, pageSize } = parsed.data;

  let query = supabase
    .from("tax_invoices")
    .select(TAX_INVOICE_LIST_SELECT)
    .eq("tenant_id", claims.tenant_id);

  if (branchId) {
    query = query.eq("branch_id", branchId);
  }

  if (before) {
    // Keyset: rows STRICTLY after the cursor under (created_at desc, id desc).
    // PostgREST has no composite "<", so OR two disjoint half-spaces:
    //   created_at < cursor.createdAt
    //   OR (created_at = cursor.createdAt AND id < cursor.id)
    query = query.or(
      `created_at.lt.${before.createdAt},and(created_at.eq.${before.createdAt},id.lt.${String(before.id)})`,
    );
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (error) {
    return { success: false, error: "Không thể tải danh sách hóa đơn." };
  }

  const fetched = (data ?? []) as Array<{
    id: number;
    created_at: string;
    order_id: number | null;
    [k: string]: unknown;
  }>;
  const hasMore = fetched.length > pageSize;
  const items = hasMore ? fetched.slice(0, pageSize) : fetched;
  const last = items.at(-1);
  const nextCursor =
    hasMore && last !== undefined
      ? { createdAt: last.created_at, id: last.id }
      : null;

  // Resolve order_number for the page in one extra query keyed by order_id.
  // Failure here is non-fatal — the list still renders, with the UI falling
  // back to `#<invoice id>` for any missing order number.
  const orderIds = Array.from(
    new Set(
      items
        .map((row) => row.order_id)
        .filter((id): id is number => typeof id === "number"),
    ),
  );

  const orderNumberById = new Map<number, string>();
  if (orderIds.length > 0) {
    const { data: orderRows } = await supabase
      .from("orders")
      .select("id, order_number")
      .eq("tenant_id", claims.tenant_id)
      .in("id", orderIds);
    for (const row of orderRows ?? []) {
      orderNumberById.set(row.id as number, row.order_number as string);
    }
  }

  const itemsWithOrder = items.map((row) => {
    const orderNumber =
      row.order_id !== null ? orderNumberById.get(row.order_id) : undefined;
    return {
      ...row,
      orders: orderNumber ? { order_number: orderNumber } : null,
    };
  });

  return {
    success: true,
    data: { items: itemsWithOrder, hasMore, nextCursor },
  };
}

/* ─── fetchRevenueRollup — aggregate mv_daily_revenue theo day/week/month ─ */

const REVENUE_GRANULARITY = ["day", "week", "month"] as const;
export type RevenueGranularity = (typeof REVENUE_GRANULARITY)[number];

// p_branch_id null = aggregate over every branch the caller has
// finance:view on. When null, ACL is enforced inside the RPC via
// has_permission(branch, key) per row; when specific, the RPC checks
// has_permission(p_branch_id, key) once at entry.
export async function fetchRevenueRollup(
  branchId: number | null,
  startDate: string,
  endDate: string,
  granularity: RevenueGranularity,
): Promise<ActionResult> {
  const parsedBranch = z.coerce
    .number()
    .int()
    .positive()
    .nullable()
    .safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const parsedStart = z.string().date().safeParse(startDate);
  const parsedEnd = z.string().date().safeParse(endDate);
  if (!parsedStart.success || !parsedEnd.success) {
    return { success: false, error: "Ngày không hợp lệ (YYYY-MM-DD)" };
  }

  const parsedGran = z.enum(REVENUE_GRANULARITY).safeParse(granularity);
  if (!parsedGran.success) {
    return { success: false, error: "Granularity không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    REPORT_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  // Supabase TS gen emits p_branch_id as non-nullable, but the RPC accepts
  // NULL = aggregate over all branches caller has finance:view on. Cast to
  // satisfy the type while preserving runtime null pass-through.
  const { data, error } = await supabase.rpc("get_revenue_rollup", {
    p_branch_id: parsedBranch.data as number,
    p_start_date: parsedStart.data,
    p_end_date: parsedEnd.data,
    p_granularity: parsedGran.data,
  });

  if (error) {
    return { success: false, error: "Không thể tải dữ liệu doanh thu." };
  }

  return { success: true, data: data ?? [] };
}

/* ─── fetchRevenueKpis — single-row hero metrics for /finance/revenue ─ */

export async function fetchRevenueKpis(
  branchId: number | null,
  startDate: string,
  endDate: string,
): Promise<ActionResult> {
  const parsedBranch = z.coerce
    .number()
    .int()
    .positive()
    .nullable()
    .safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const parsedStart = z.string().date().safeParse(startDate);
  const parsedEnd = z.string().date().safeParse(endDate);
  if (!parsedStart.success || !parsedEnd.success) {
    return { success: false, error: "Ngày không hợp lệ (YYYY-MM-DD)" };
  }

  const ctx = await getAuthContextWithPermission(
    REPORT_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  // Same NULL-branch pass-through as get_revenue_rollup.
  const { data, error } = await ctx.supabase.rpc("get_revenue_kpis", {
    p_branch_id: parsedBranch.data as number,
    p_start_date: parsedStart.data,
    p_end_date: parsedEnd.data,
  });

  if (error) {
    return { success: false, error: "Không thể tải chỉ số KPI." };
  }

  // RPC returns a single-row resultset.
  return { success: true, data: data?.[0] ?? null };
}

/* ─── fetchFinanceDashboardSummary — work-queue counters for /finance ─── */

const dashboardSummarySchema = z.object({
  branchId: z.coerce.number().int().positive().nullable(),
  startDate: z.string().date(),
  endDate: z.string().date(),
});

export interface FinanceDashboardSummary {
  invoice_attention_count: number;
  invoice_issued_count: number;
  invoice_not_required_count: number;
  failed_webhook_count: number;
}

export async function fetchFinanceDashboardSummary(
  branchId: number | null,
  startDate: string,
  endDate: string,
): Promise<ActionResult> {
  const parsed = dashboardSummarySchema.safeParse({
    branchId,
    startDate,
    endDate,
  });
  if (!parsed.success || parsed.data.startDate > parsed.data.endDate) {
    return { success: false, error: "Tham số dashboard không hợp lệ." };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { data, error } = await ctx.supabase.rpc(
    "get_finance_dashboard_summary",
    {
      p_start_date: parsed.data.startDate,
      p_end_date: parsed.data.endDate,
      p_branch_id: parsed.data.branchId ?? undefined,
    },
  );

  if (error) {
    return { success: false, error: "Không thể tải chỉ số dashboard." };
  }

  return { success: true, data: data?.[0] ?? null };
}

/* ─── fetchOrdersForDay — drill-down list cho 1 (branch, date) ─ */

export async function fetchOrdersForDay(
  branchId: number,
  date: string,
): Promise<ActionResult> {
  const parsedBranch = z.coerce.number().int().positive().safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const parsedDate = z.string().date().safeParse(date);
  if (!parsedDate.success) {
    return { success: false, error: "Ngày không hợp lệ (YYYY-MM-DD)" };
  }

  const ctx = await getAuthContextWithPermission(
    REPORT_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { data, error } = await ctx.supabase.rpc("get_orders_for_day", {
    p_branch_id: parsedBranch.data,
    p_date: parsedDate.data,
  });

  if (error) {
    return { success: false, error: "Không thể tải danh sách đơn." };
  }

  return { success: true, data: data ?? [] };
}

/* ─── fetchCashVarianceSummary — cash variance at shift close ─ */

export async function fetchCashVarianceSummary(
  branchId: number | null,
  startDate: string,
  endDate: string,
): Promise<ActionResult> {
  const parsedBranch = z.coerce
    .number()
    .int()
    .positive()
    .nullable()
    .safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const parsedStart = z.string().date().safeParse(startDate);
  const parsedEnd = z.string().date().safeParse(endDate);
  if (!parsedStart.success || !parsedEnd.success) {
    return { success: false, error: "Ngày không hợp lệ (YYYY-MM-DD)" };
  }

  const ctx = await getAuthContextWithPermission(
    REPORT_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  // Same NULL-branch pass-through as get_revenue_rollup.
  const { data, error } = await ctx.supabase.rpc("get_cash_variance_summary", {
    p_branch_id: parsedBranch.data as number,
    p_start_date: parsedStart.data,
    p_end_date: parsedEnd.data,
  });

  if (error) {
    return { success: false, error: "Không thể tải dữ liệu lệch tiền." };
  }

  return { success: true, data: data?.[0] ?? null };
}

/* ─── fetchRevenueByHour — 7×24 heatmap for consolidated revenue ── */
// 90-day cap enforced at RPC level (matches the application guard). The
// hour bucket uses `(paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')` to match
// rule REVENUE-BUCKET-BY-PAID-AT-LOCAL-TZ. Returns 1 row per (dow, hour).
export async function fetchRevenueByHour(
  branchId: number | null,
  startDate: string,
  endDate: string,
): Promise<ActionResult> {
  const parsedBranch = z.coerce
    .number()
    .int()
    .positive()
    .nullable()
    .safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const parsedStart = z.string().date().safeParse(startDate);
  const parsedEnd = z.string().date().safeParse(endDate);
  if (!parsedStart.success || !parsedEnd.success) {
    return { success: false, error: "Ngày không hợp lệ (YYYY-MM-DD)" };
  }

  const ctx = await getAuthContextWithPermission(
    REPORT_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { data, error } = await ctx.supabase.rpc("get_revenue_by_hour", {
    p_branch_id: parsedBranch.data as number,
    p_start_date: parsedStart.data,
    p_end_date: parsedEnd.data,
  });

  if (error) {
    return {
      success: false,
      error: "Không thể tải dữ liệu doanh thu theo giờ.",
    };
  }

  return { success: true, data: data ?? [] };
}

/* ─── fetchRevenueByCashier — bar chart cho cashier productivity ── */
export async function fetchRevenueByCashier(
  branchId: number | null,
  startDate: string,
  endDate: string,
): Promise<ActionResult> {
  const parsedBranch = z.coerce
    .number()
    .int()
    .positive()
    .nullable()
    .safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const parsedStart = z.string().date().safeParse(startDate);
  const parsedEnd = z.string().date().safeParse(endDate);
  if (!parsedStart.success || !parsedEnd.success) {
    return { success: false, error: "Ngày không hợp lệ (YYYY-MM-DD)" };
  }

  const ctx = await getAuthContextWithPermission(
    REPORT_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { data, error } = await ctx.supabase.rpc("get_revenue_by_cashier", {
    p_branch_id: parsedBranch.data as number,
    p_start_date: parsedStart.data,
    p_end_date: parsedEnd.data,
  });

  if (error) {
    return { success: false, error: "Không thể tải dữ liệu thu ngân." };
  }

  return { success: true, data: data ?? [] };
}

/* ─── fetchAccessibleBranches — branches with finance:view ─ */
// Branch picker source. Owner: all active operational branches.
// Branch-scoped users only see their own branch. Filter by
// `branch_kind='branch'` to drop non-operational rows with no revenue.
export async function fetchAccessibleBranches(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    REPORT_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // Tenant-wide roles see all operational branches.
  if (claims.user_role === "owner") {
    const { data, error } = await supabase
      .from("branches")
      .select("id, name")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_kind", "branch")
      .eq("is_active", true)
      .order("name");
    if (error) {
      return { success: false, error: "Không thể tải danh sách chi nhánh." };
    }
    return { success: true, data: data ?? [] };
  }

  // branch_manager / cashier scope: only their own branch.
  if (claims.branch_id != null) {
    const { data, error } = await supabase
      .from("branches")
      .select("id, name")
      .eq("tenant_id", claims.tenant_id)
      .eq("id", claims.branch_id)
      .eq("is_active", true)
      .maybeSingle();
    if (error || !data) {
      return { success: true, data: [] };
    }
    return { success: true, data: [data] };
  }

  return { success: true, data: [] };
}

export async function fetchTopItems(
  branchId: number | null,
  startDate: string,
  endDate: string,
): Promise<ActionResult> {
  const parsedBranch = z.coerce
    .number()
    .int()
    .positive()
    .nullable()
    .safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const parsedStart = z.string().date().safeParse(startDate);
  const parsedEnd = z.string().date().safeParse(endDate);
  if (
    !parsedStart.success ||
    !parsedEnd.success ||
    parsedStart.data > parsedEnd.data
  ) {
    return {
      success: false,
      error: "Khoảng ngày không hợp lệ (YYYY-MM-DD)",
    };
  }

  const ctx = await getAuthContextWithPermission(
    REPORT_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("get_top_items", {
    p_branch_id: parsedBranch.data as number,
    p_start_date: parsedStart.data,
    p_end_date: parsedEnd.data,
    p_limit: 20,
  });

  if (error) {
    return { success: false, error: "Không thể tải dữ liệu top món." };
  }

  return { success: true, data: data ?? [] };
}

/* ─── Refresh Materialized Views ─── */

export async function refreshMaterializedViews(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  const { error: rpcErr } = await supabase.rpc("refresh_finance_views");

  if (rpcErr) {
    return { success: false, error: "Không thể làm mới dữ liệu báo cáo." };
  }

  return { success: true };
}
