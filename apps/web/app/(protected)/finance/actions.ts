"use server";

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getInvoiceProvider } from "@comtammatu/shared/providers";
import { ensureInvoiceProviderRegistered } from "@lib/invoice-provider-init";
import { messages } from "@lib/messages";
import {
  createInvoiceSchema,
  issueTaxInvoiceForPaidOrder,
} from "@lib/hddt-per-order";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { canAccessBranch } from "@/_lib/branch-scope";
import { logAudit } from "@/_lib/audit";
import {
  queryActiveInvoiceForOrder,
  type InvoiceQueryClient,
} from "./_lib/invoice-queries";
import type { ManualInvoiceOrderPreview } from "./_lib/finance-types";

const FINANCE_ROLES: readonly StaffRole[] = ["owner"];
const INVOICE_CREATE_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
  "cashier",
];
const REPORT_ROLES: readonly StaffRole[] = ["owner", "branch_manager"];

/* ─── HĐĐT: Create Invoice ─── */

/**
 * Read-only resolve of the active tax invoice for an order, tenant-scoped.
 * Mirrors the existing-invoice query in createTaxInvoice (same
 * cancelled/replaced/not_required exclusion) so a POS idempotent payment replay
 * can report the real invoice state without re-issuing. data is null when no
 * active invoice row exists.
 */
export async function resolveExistingInvoiceForOrder(orderId: number): Promise<
  ActionResult<{
    id: number;
    invoice_number: string | null;
    status: string | null;
  } | null>
> {
  const parsed = z.coerce.number().int().positive().safeParse(orderId);
  if (!parsed.success) {
    return { success: false, error: "Order ID không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    INVOICE_CREATE_ROLES,
    PERMISSION_KEYS.ORDERS_WRITE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  // Seam cast: the real client structurally satisfies InvoiceQueryClient, but
  // matching supabase-js's deep generics against it trips TS2589. The cast
  // narrows to the small surface the query uses; the mock satisfies it directly.
  return queryActiveInvoiceForOrder(
    supabase as unknown as InvoiceQueryClient,
    claims.tenant_id,
    parsed.data,
  );
}

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

  const result = await issueTaxInvoiceForPaidOrder({
    supabase,
    tenantId: claims.tenant_id,
    input: parsed.data,
    actorId: user.id,
    canAccessBranch: (branchId) => canAccessBranch(supabase, claims, branchId),
    logPrefix: "finance/actions:createTaxInvoice",
  });
  if (!result.success) return result;

  await logAudit(supabase, {
    action: "create",
    entityType: "tax_invoice",
    entityId: result.data?.id ?? null,
    newData: {
      invoice_number: result.data?.invoice_number,
      status: result.data?.status,
    },
  });

  return result;
}

/* ─── HĐĐT: Bulk re-issue provider-rejected drafts ─── */

const REISSUE_ALL_CAP = 20;
const REISSUE_ALL_BUDGET_MS = 40_000;
const SEPAY_MISSING_SCAN_CAP = 200;
const financeActionErrors = messages.finance.actionErrors;

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
    .select(
      "id, order_id, buyer_name, buyer_tax_code, buyer_address, buyer_email",
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("status", "draft")
    .is("invoice_number", null)
    .not("order_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(REISSUE_ALL_CAP);

  if (error) {
    console.error(
      "[finance/actions:reissueAllDraftInvoices] Fetch drafts error:",
      error,
    );
    return { success: false, errorCode: "load_failed" };
  }

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
      buyerAddress: draft.buyer_address ?? undefined,
      buyerEmail: draft.buyer_email ?? undefined,
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

export async function issueMissingSepayInvoices(): Promise<
  ActionResult<{
    issued: number;
    failed: number;
    skipped: number;
    remainingInScan: number;
  }>
> {
  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) return { success: false, errorCode: "forbidden" };

  const { supabase, claims, user } = ctx;

  const { data: webhookRows, error: webhookErr } = await supabase
    .from("webhook_events")
    .select("id, payment_id")
    .eq("tenant_id", claims.tenant_id)
    .eq("provider", "sepay")
    .eq("processing_status", "processed")
    .or("error_code.is.null,error_code.neq.invoice_binding_manual_review")
    .not("payment_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(SEPAY_MISSING_SCAN_CAP);

  if (webhookErr) {
    console.error(
      "[finance/actions:issueMissingSepayInvoices] Fetch webhook_events error:",
      webhookErr,
    );
    return { success: false, errorCode: "load_failed" };
  }

  const candidatePaymentIds = Array.from(
    new Set(
      (webhookRows ?? [])
        .map((row) => row.payment_id)
        .filter((id): id is number => typeof id === "number"),
    ),
  );
  if (candidatePaymentIds.length === 0) {
    return {
      success: true,
      data: { issued: 0, failed: 0, skipped: 0, remainingInScan: 0 },
    };
  }

  const { data: manualReviewRows, error: manualReviewErr } = await supabase
    .from("webhook_events")
    .select("payment_id")
    .eq("tenant_id", claims.tenant_id)
    .eq("provider", "sepay")
    .eq("processing_status", "processed")
    .eq("error_code", "invoice_binding_manual_review")
    .in("payment_id", candidatePaymentIds);

  if (manualReviewErr) {
    console.error(
      "[finance/actions:issueMissingSepayInvoices] Fetch manual review events error:",
      manualReviewErr,
    );
    return { success: false, errorCode: "load_failed" };
  }

  const manualReviewPaymentIds = new Set(
    (manualReviewRows ?? [])
      .map((row) => row.payment_id)
      .filter((id): id is number => typeof id === "number"),
  );
  const paymentIds = candidatePaymentIds.filter(
    (paymentId) => !manualReviewPaymentIds.has(paymentId),
  );
  if (paymentIds.length === 0) {
    return {
      success: true,
      data: { issued: 0, failed: 0, skipped: 0, remainingInScan: 0 },
    };
  }

  const { data: payments, error: paymentErr } = await supabase
    .from("payments")
    .select("id, order_id")
    .eq("tenant_id", claims.tenant_id)
    .eq("method", "vietqr")
    .eq("status", "completed")
    .in("id", paymentIds);

  if (paymentErr) {
    console.error(
      "[finance/actions:issueMissingSepayInvoices] Fetch payments error:",
      paymentErr,
    );
    return { success: false, errorCode: "load_failed" };
  }

  const orderIds = Array.from(new Set((payments ?? []).map((p) => p.order_id)));
  if (orderIds.length === 0) {
    return {
      success: true,
      data: { issued: 0, failed: 0, skipped: 0, remainingInScan: 0 },
    };
  }

  const [{ data: activeInvoices }, { data: summaryLinks }] = await Promise.all([
    supabase
      .from("tax_invoices")
      .select("order_id")
      .eq("tenant_id", claims.tenant_id)
      .in("order_id", orderIds)
      .not("status", "in", '("cancelled","replaced","not_required")'),
    supabase
      .from("tax_invoice_orders")
      .select("order_id, tax_invoices(status)")
      .eq("tenant_id", claims.tenant_id)
      .in("order_id", orderIds),
  ]);

  const invoicedOrderIds = new Set(
    (activeInvoices ?? [])
      .map((row) => row.order_id)
      .filter((id): id is number => typeof id === "number"),
  );
  const summaryOrderIds = new Set(
    (
      (summaryLinks ?? []) as Array<{
        order_id: number | null;
        tax_invoices: { status: string } | null;
      }>
    )
      .filter(
        (link) =>
          link.order_id != null &&
          link.tax_invoices != null &&
          !["cancelled", "replaced"].includes(link.tax_invoices.status),
      )
      .map((link) => link.order_id as number),
  );

  const missingOrderIds = orderIds.filter(
    (orderId) =>
      !invoicedOrderIds.has(orderId) && !summaryOrderIds.has(orderId),
  );

  let issued = 0;
  let failed = 0;
  let skipped = 0;
  const startedAt = Date.now();
  for (const orderId of missingOrderIds.slice(0, REISSUE_ALL_CAP)) {
    if (Date.now() - startedAt > REISSUE_ALL_BUDGET_MS) break;
    const result = await issueTaxInvoiceForPaidOrder({
      supabase,
      tenantId: claims.tenant_id,
      input: { orderId, buyerNotGetInvoice: true },
      actorId: user.id,
      canAccessBranch: (branchId) =>
        canAccessBranch(supabase, claims, branchId),
      logPrefix: "finance/actions:issueMissingSepayInvoices",
    });
    if (result.success) {
      issued += 1;
    } else if (
      result.errorCode === "invoice_exists" ||
      result.errorCode === "summary_invoice_exists"
    ) {
      skipped += 1;
    } else {
      failed += 1;
    }
  }

  return {
    success: true,
    data: {
      issued,
      failed,
      skipped,
      remainingInScan: Math.max(0, missingOrderIds.length - issued - skipped),
    },
  };
}

/* ─── HĐĐT: Manual issue for a past paid order ─── */

const manualInvoiceLookupSchema = z.object({
  orderNumber: z
    .string()
    .trim()
    .min(1, "Nhập mã đơn")
    .max(64, "Mã đơn quá dài"),
  branchId: z.coerce.number().int().positive(),
});

/**
 * Read-only preview for the manual "issue HĐĐT for a past paid order" dialog.
 * Resolves an order by (branch_id, order_number) — order_number is unique only
 * per (branch_id, order_number, tenant_id), so a tenant-wide lookup could match
 * the wrong branch's order and issue an HĐĐT against a stranger's bill. This
 * NEVER mutates; issuance runs through createTaxInvoice, which re-checks every
 * guard. The preview only lets the operator confirm the right order and see
 * ineligibility (already invoiced / folded into a B2C summary / unpaid) early.
 */
export async function resolveOrderForManualInvoice(
  input: z.infer<typeof manualInvoiceLookupSchema>,
): Promise<ActionResult<ManualInvoiceOrderPreview>> {
  const parsed = manualInvoiceLookupSchema.safeParse(input);
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

  const { supabase, claims } = ctx;

  if (!(await canAccessBranch(supabase, claims, parsed.data.branchId))) {
    return { success: false, error: "Không có quyền cho chi nhánh này." };
  }

  // Order numbers are stored upper-case + hyphenated (TC-/MV-YYMMDD-NNN[-BR]);
  // tolerate a leading "#" and lower-case input copied off the receipt. Match
  // stays an exact .eq (not fuzzy) — issuance targets one order, not a guess.
  const orderNumber = parsed.data.orderNumber.replace(/^#+/, "").toUpperCase();

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(
      "id, order_number, branch_id, payment_status, total_amount, created_at, order_items(status)",
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", parsed.data.branchId)
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (orderErr) {
    console.error(
      "[finance/actions:resolveOrderForManualInvoice] Fetch order error:",
      orderErr,
    );
    return { success: false, error: "Không thể tra đơn." };
  }
  if (!order) {
    return { success: false, error: "Không tìm thấy đơn trong chi nhánh này." };
  }

  const paid = order.payment_status === "paid";
  // createTaxInvoice rejects an order whose items are all cancelled
  // ("Đơn hàng không có món nào để xuất hóa đơn."); surface it in the preview.
  const hasActiveItems = (order.order_items ?? []).some(
    (item) => item.status !== "cancelled",
  );

  // Active per-order invoice — reuse the exact query createTaxInvoice gates on
  // (excludes cancelled/replaced/not_required). A provider-rejected draft with
  // no number is a RETRY candidate, not a blocker.
  const existing = await queryActiveInvoiceForOrder(
    supabase as unknown as InvoiceQueryClient,
    claims.tenant_id,
    order.id,
  );
  const existingInvoice = existing.success ? existing.data : null;
  const isDraftRetry =
    existingInvoice?.status === "draft" && !existingInvoice.invoice_number;
  const hasActiveInvoice = existingInvoice != null && !isDraftRetry;

  // B2C daily-summary fold — mirror createTaxInvoice's junction check so the
  // preview surfaces the summary date before the operator hits the block.
  const { data: summaryLinks } = await supabase
    .from("tax_invoice_orders")
    .select("tax_invoices(summary_date, status)")
    .eq("order_id", order.id)
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

  return {
    success: true,
    data: {
      orderId: order.id,
      orderNumber: order.order_number,
      branchId: order.branch_id,
      totalAmount: Number(order.total_amount),
      createdAt: order.created_at,
      paymentStatus: order.payment_status,
      existingInvoiceStatus: existingInvoice?.status ?? null,
      existingInvoiceNumber: existingInvoice?.invoice_number ?? null,
      isDraftRetry: Boolean(isDraftRetry),
      hasActiveItems,
      summaryDate: summaryInvoice?.summary_date ?? null,
      issuable: paid && hasActiveItems && !hasActiveInvoice && !summaryInvoice,
    },
  };
}

/**
 * Whether the current user can complete the manual-issue flow end-to-end — the
 * SAME predicate createTaxInvoice enforces (INVOICE_CREATE_ROLES +
 * orders:write). The /finance/invoices "issue for a past order" button gates on
 * THIS, not on canManageInvoices (settings:tenant || orders:refund_approve):
 * those axes differ, so gating on the wrong one shows the button to users the
 * action then rejects, or hides it from users who can legitimately issue.
 */
export async function canIssueManualInvoice(): Promise<boolean> {
  const ctx = await getAuthContextWithPermission(
    INVOICE_CREATE_ROLES,
    PERMISSION_KEYS.ORDERS_WRITE,
  );
  return ctx != null;
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

// NĐ 254/2026 + TT 32/2025 require every HĐĐT cancellation to
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
    if (fetchErr) {
      console.error(
        "[finance/actions:cancelTaxInvoice] Fetch invoice error:",
        fetchErr,
      );
    }
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
    console.error(
      "[finance/actions:cancelTaxInvoice] Transition invoice state error:",
      rpcErr,
    );
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
  id, order_id, invoice_number, status, buyer_name, buyer_tax_code, buyer_email,
  subtotal, vat_rate, vat_amount, total_amount,
  issued_at, cancelled_at, archived_at, created_at
` as const;

const TAX_INVOICE_PAGE_SIZE = 50;

// "Attention" queue = invoices still needing operator action (provider-rejected
// drafts + in-flight issuance), excluding terminal states. Lets
// /finance/invoices?queue=attention surface drafts on page 1 so the bulk
// re-issue button appears without manual "Tải thêm" paging.
const ATTENTION_STATES = ["draft", "signing", "submitted"] as const;

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
  queue: z.enum(["attention"]).optional(),
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
  const { branchId, before, pageSize, queue } = parsed.data;

  let query = supabase
    .from("tax_invoices")
    .select(TAX_INVOICE_LIST_SELECT)
    .eq("tenant_id", claims.tenant_id);

  if (branchId) {
    query = query.eq("branch_id", branchId);
  }

  if (queue === "attention") {
    query = query.in("status", [...ATTENTION_STATES]);
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
    console.error(
      "[finance/actions:fetchTaxInvoicesPage] Fetch tax invoices error:",
      error,
    );
    return { success: false, error: financeActionErrors.loadTaxInvoicesFailed };
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

/* ─── fetchRevenueRollup — live paid-at revenue by day/week/month ─ */

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
    console.error(
      "[finance/actions:fetchRevenueRollup] RPC get_revenue_rollup error:",
      error,
    );
    return {
      success: false,
      error: financeActionErrors.loadRevenueRollupFailed,
    };
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
    console.error(
      "[finance/actions:fetchRevenueKpis] RPC get_revenue_kpis error:",
      error,
    );
    return { success: false, error: financeActionErrors.loadRevenueKpisFailed };
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
    console.error(
      "[finance/actions:fetchFinanceDashboardSummary] RPC get_finance_dashboard_summary error:",
      error,
    );
    return {
      success: false,
      error: financeActionErrors.loadDashboardSummaryFailed,
    };
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
    console.error(
      "[finance/actions:fetchOrdersForDay] RPC get_orders_for_day error:",
      error,
    );
    return { success: false, error: financeActionErrors.loadOrdersFailed };
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
    console.error(
      "[finance/actions:fetchCashVarianceSummary] RPC get_cash_variance_summary error:",
      error,
    );
    return {
      success: false,
      error: financeActionErrors.loadCashVarianceFailed,
    };
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
    console.error(
      "[finance/actions:fetchRevenueByHour] RPC get_revenue_by_hour error:",
      error,
    );
    return {
      success: false,
      error: financeActionErrors.loadRevenueByHourFailed,
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
    console.error(
      "[finance/actions:fetchRevenueByCashier] RPC get_revenue_by_cashier error:",
      error,
    );
    return {
      success: false,
      error: financeActionErrors.loadRevenueByCashierFailed,
    };
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
      console.error(
        "[finance/actions:fetchAccessibleBranches] Fetch branches error (owner):",
        error,
      );
      return { success: false, error: financeActionErrors.loadBranchesFailed };
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
      if (error) {
        console.error(
          "[finance/actions:fetchAccessibleBranches] Fetch branch error (branch_user):",
          error,
        );
      }
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
    console.error(
      "[finance/actions:fetchTopItems] RPC get_top_items error:",
      error,
    );
    return { success: false, error: financeActionErrors.loadTopItemsFailed };
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
    console.error(
      "[finance/actions:refreshMaterializedViews] RPC refresh_finance_views error:",
      rpcErr,
    );
    return { success: false, error: "Không thể làm mới dữ liệu báo cáo." };
  }

  return { success: true };
}
