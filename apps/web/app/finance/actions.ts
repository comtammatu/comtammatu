"use server";

import { z } from "zod";
import { randomUUID as _randomUUID } from "crypto";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getInvoiceProvider } from "@comtammatu/shared/providers";
import {
  SYSTEM_SETTING_KEYS,
  SYSTEM_SETTING_DEFAULTS,
} from "@comtammatu/shared/settings";
import { ensureInvoiceProviderRegistered } from "@lib/invoice-provider-init";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { canAccessBranch } from "@/admin/_lib/branch-scope";
import { logAudit } from "@/admin/_lib/audit";

const FINANCE_ROLES: readonly StaffRole[] = ["owner", "super_manager"];
const INVOICE_CREATE_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
  "cashier",
  "waiter",
];
const REPORT_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
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
  })
  .refine((v) => !v.buyerTaxCode || (v.buyerName && v.buyerName.length > 0), {
    error: "Có MST thì phải nhập tên người mua",
    path: ["buyerName"],
  });

/**
 * Create a draft tax invoice for an order.
 * In production, this would call MISA meInvoice API to sign and submit.
 * For MVP, we create the draft and mark it as issued (mock MISA integration).
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
      "id, branch_id, subtotal, tax_amount, total_amount, payment_status, order_items(id, item_name, variant_name, quantity, unit_price, subtotal, status, vat_rate)",
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

  // Branch scope check (area_manager must be in area_branches mapping)
  if (!(await canAccessBranch(supabase, claims, order.branch_id))) {
    return {
      success: false,
      error: "Không có quyền xuất hóa đơn cho chi nhánh này.",
    };
  }

  // Check no existing active invoice for this order. `not_required` is
  // terminal-opt-out per D4 (2026-04-26) — it does NOT count as active so
  // a future real invoice issuance for the same order is allowed.
  const { data: existing } = await supabase
    .from("tax_invoices")
    .select("id")
    .eq("order_id", parsed.data.orderId)
    .eq("tenant_id", claims.tenant_id)
    .not("status", "in", '("cancelled","replaced","not_required")')
    .maybeSingle();

  if (existing) {
    return { success: false, error: "Đơn hàng đã có hóa đơn." };
  }

  // Per-line VAT aggregation (rule VAT-PER-LINE-NOT-PER-INVOICE).
  // Each order_item carries its own vat_rate snapshot. For uniform-rate
  // orders this is mathematically equivalent to the legacy
  // `total / (1 + system_rate)` formula; for mixed-rate orders
  // (cơm 8% + bia 10%) it produces the correct subtotal/VAT breakdown
  // that the legacy single-rate division could not.
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
    // Edge: no active items or zero subtotal. Fall back to system_settings
    // VAT rate so the not_required audit row has a sensible header rate.
    const { data: vatSetting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("tenant_id", claims.tenant_id)
      .eq("key", SYSTEM_SETTING_KEYS.VAT_RATE)
      .maybeSingle();
    vatRate = Number(
      vatSetting?.value ??
        SYSTEM_SETTING_DEFAULTS[SYSTEM_SETTING_KEYS.VAT_RATE],
    );
    subtotal = orderTotal / (1 + vatRate / 100);
    vatAmount = orderTotal - subtotal;
  }

  // D4 short-circuit (owner 2026-04-26): no MST → skip MISA call, insert
  // an audit row with status='not_required'. Khách comp meal / khách lẻ
  // không yêu cầu HĐĐT thì không tốn MISA quota; nếu sau này khách quay
  // lại nhập MST, createTaxInvoice gọi lần nữa sẽ insert hóa đơn thật
  // (uq_tax_invoices_active_per_order loại trừ not_required).
  const buyerTaxCodeTrimmed = parsed.data.buyerTaxCode?.trim() ?? "";
  const hasMst = buyerTaxCodeTrimmed.length > 0;

  if (!hasMst) {
    const { data: skipInvoice, error: skipErr } = await supabase
      .from("tax_invoices")
      .insert({
        tenant_id: claims.tenant_id,
        branch_id: order.branch_id,
        order_id: parsed.data.orderId,
        invoice_number: null,
        status: "not_required",
        buyer_name: parsed.data.buyerName ?? null,
        buyer_tax_code: null,
        buyer_address: parsed.data.buyerAddress ?? null,
        subtotal: Math.round(subtotal * 100) / 100,
        vat_rate: vatRate,
        vat_amount: Math.round(vatAmount * 100) / 100,
        total_amount: Number(order.total_amount),
        provider: "skipped",
        provider_ref: null,
        provider_data: null,
        issued_at: null,
        created_by: user.id,
      })
      .select("id, invoice_number, status")
      .single();

    if (skipErr) {
      if (skipErr.code === "23505") {
        return { success: false, error: "Đơn hàng đã có hóa đơn." };
      }
      return { success: false, error: "Không thể ghi trạng thái HĐĐT." };
    }

    await logAudit(supabase, {
      action: "create",
      entityType: "tax_invoice",
      entityId: skipInvoice?.id ?? null,
      newData: { status: "not_required", reason: "no_mst" },
    });

    return { success: true, data: skipInvoice };
  }

  // Use provider interface — swap MISA/ViettelSinvoice without changing this code
  ensureInvoiceProviderRegistered();
  const invoiceProvider = getInvoiceProvider();

  let invoiceNumber: string | null;
  let providerRef: string | null;
  let invoiceStatus: "draft" | "signing" | "submitted" | "issued";
  let providerData: Record<string, unknown> | undefined;

  // activeItems already computed above for VAT aggregation; the empty-
  // items check still applies here (HĐĐT to MISA cannot have zero lines).
  if (activeItems.length === 0) {
    return {
      success: false,
      error: "Đơn hàng không có món nào để xuất hóa đơn.",
    };
  }

  const invoiceItems = activeItems.map((item) => ({
    name: item.variant_name
      ? `${item.item_name} - ${item.variant_name}`
      : item.item_name,
    unit: "Phần",
    quantity: item.quantity,
    unitPrice: Number(item.unit_price),
    amount: Number(item.subtotal),
  }));

  if (invoiceProvider) {
    const result = await invoiceProvider.createInvoice({
      orderId: parsed.data.orderId,
      orderNumber: `ORD-${parsed.data.orderId}`,
      sellerName: "Cơm Tấm Má Tư CTCP",
      sellerTaxCode: process.env.COMPANY_TAX_CODE ?? "",
      sellerAddress: "",
      buyerName: parsed.data.buyerName,
      buyerTaxCode: parsed.data.buyerTaxCode,
      buyerAddress: parsed.data.buyerAddress,
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

  const { data: invoice, error: insertErr } = await supabase
    .from("tax_invoices")
    .insert({
      tenant_id: claims.tenant_id,
      branch_id: order.branch_id,
      order_id: parsed.data.orderId,
      invoice_number: invoiceNumber,
      status: invoiceStatus,
      buyer_name: parsed.data.buyerName ?? null,
      buyer_tax_code: parsed.data.buyerTaxCode ?? null,
      buyer_address: parsed.data.buyerAddress ?? null,
      subtotal: Math.round(subtotal * 100) / 100,
      vat_rate: vatRate,
      vat_amount: Math.round(vatAmount * 100) / 100,
      total_amount: Number(order.total_amount),
      provider: invoiceProvider?.name ?? "mock",
      provider_ref: providerRef,
      provider_data: providerData
        ? JSON.parse(JSON.stringify(providerData))
        : null,
      issued_at: invoiceStatus === "issued" ? new Date().toISOString() : null,
      created_by: user.id,
    })
    .select("id, invoice_number")
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
  // call asynchronously (DB is already cancelled, no asymmetric "MISA
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
  if (invoice.provider_ref && invoice.provider !== "mock") {
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

/* ─── Fetch Invoice Audit Trail ─── */

export async function fetchTaxInvoiceEvents(
  invoiceId: number,
): Promise<ActionResult> {
  const parsed = z.coerce.number().int().positive().safeParse(invoiceId);
  if (!parsed.success) {
    return { success: false, error: "Invoice ID không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("tax_invoice_events")
    .select("id, from_status, to_status, payload, note, actor_id, created_at")
    .eq("tax_invoice_id", parsed.data)
    .eq("tenant_id", claims.tenant_id)
    .order("created_at", { ascending: false });

  if (error) {
    return { success: false, error: "Không thể tải nhật ký hóa đơn." };
  }

  return { success: true, data: data ?? [] };
}

/* ─── Fetch Invoices ─── */

export async function fetchTaxInvoices(
  branchId?: number,
): Promise<ActionResult> {
  const parsedBranch = z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  let query = supabase
    .from("tax_invoices")
    .select(
      `
      id, invoice_number, status, buyer_name, buyer_tax_code,
      subtotal, vat_rate, vat_amount, total_amount,
      issued_at, cancelled_at, created_at,
      orders ( order_number )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .order("created_at", { ascending: false });

  if (parsedBranch.data) {
    query = query.eq("branch_id", parsedBranch.data);
  }

  const { data, error } = await query;

  if (error) {
    return { success: false, error: "Không thể tải danh sách hóa đơn." };
  }

  return { success: true, data: data ?? [] };
}

/* ─── Revenue Dashboard ─── */

export async function fetchDailyRevenue(
  branchId: number,
  startDate: string,
  endDate: string,
): Promise<ActionResult> {
  const parsedBranch = z.coerce.number().int().positive().safeParse(branchId);
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

  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("get_daily_revenue", {
    p_branch_id: parsedBranch.data,
    p_start_date: parsedStart.data,
    p_end_date: parsedEnd.data,
  });

  if (error) {
    return { success: false, error: "Không thể tải dữ liệu doanh thu." };
  }

  return { success: true, data: data ?? [] };
}

/* ─── fetchRevenueRollup — aggregate mv_daily_revenue theo day/week/month ─ */

const REVENUE_GRANULARITY = ["day", "week", "month"] as const;
export type RevenueGranularity = (typeof REVENUE_GRANULARITY)[number];

// p_branch_id null = aggregate qua mọi branch caller có finance:view.
// Khi null, ACL được enforce bên trong RPC qua has_permission(branch, key)
// per row. Khi specific, RPC kiểm tra has_permission(p_branch_id, key)
// một lần ở entry.
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
  journal_draft_count: number;
  journal_posted_count: number;
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

/* ─── fetchReconciliationByDay — Phase 3: per-day DT vs Sổ ─ */

export async function fetchReconciliationByDay(
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
  const { data, error } = await ctx.supabase.rpc("fn_reconcile_sales_by_day", {
    p_branch_id: parsedBranch.data as number,
    p_start_date: parsedStart.data,
    p_end_date: parsedEnd.data,
  });

  if (error) {
    return { success: false, error: "Không thể tải đối chiếu theo ngày." };
  }

  return { success: true, data: data ?? [] };
}

/* ─── fetchCashVarianceSummary — Phase 3: lệch tiền cuối ca ─ */

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

/* ─── fetchAccessibleBranches — branches user có finance:view ─ */
// Branch picker source. Owner/super_manager: all active operational
// branches. area_manager: branches in their area. branch_manager:
// only their own branch. Filter by `branch_kind='branch'` để loại
// "tenant" / "area" rows (logical containers, không phát sinh DT).
export async function fetchAccessibleBranches(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    REPORT_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // Tenant-wide roles see all operational branches.
  if (claims.user_role === "owner" || claims.user_role === "super_manager") {
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

  // area_manager: scope qua area_branches mapping.
  if (claims.user_role === "area_manager" && claims.area_id != null) {
    const { data, error } = await supabase
      .from("area_branches")
      .select("branch_id, branches!inner(id, name, is_active, branch_kind)")
      .eq("tenant_id", claims.tenant_id)
      .eq("area_id", claims.area_id)
      .eq("branches.is_active", true)
      .eq("branches.branch_kind", "branch");
    if (error) {
      return { success: false, error: "Không thể tải danh sách chi nhánh." };
    }
    const rows = (data ?? [])
      .map((r) => r.branches)
      .filter(
        (
          b,
        ): b is {
          id: number;
          name: string;
          is_active: boolean;
          branch_kind: string;
        } => Boolean(b),
      )
      .map((b) => ({ id: b.id, name: b.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { success: true, data: rows };
  }

  // branch_manager / cashier scope: chỉ thấy chi nhánh của mình.
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
  periodStart: string,
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

  const parsedPeriod = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .safeParse(periodStart);
  if (!parsedPeriod.success) {
    return {
      success: false,
      error: "Ngày bắt đầu không hợp lệ (YYYY-MM-DD)",
    };
  }

  const ctx = await getAuthContextWithPermission(
    REPORT_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  // RLS does not apply to materialized views — access goes through a
  // SECURITY DEFINER wrapper that re-checks tenant_id + branch + ACL.
  // See migration 20260427000000_secure_finance_mvs_revoke_grants.sql.
  const { data, error } = await supabase.rpc("get_top_items", {
    p_branch_id: parsedBranch.data as number,
    p_period_start: parsedPeriod.data,
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

/* ─── Audit Logs ─── */

export async function fetchAuditLogs(
  entityType?: string,
  limitCount?: number,
): Promise<ActionResult> {
  const parsedLimit = z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .safeParse(limitCount);

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // Explicit column list — drop ip_address (request-level PII) and
  // raw `old_data`/`new_data` blobs (buyer addresses, MST, salaries
  // depending on entity_type). The action+entity_id pair is enough to
  // reconstruct who did what to which row; if a deeper audit is needed,
  // a future RPC can return diffs gated on a per-event permission.
  let query = supabase
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, user_id, created_at")
    .eq("tenant_id", claims.tenant_id)
    .order("created_at", { ascending: false })
    .limit(parsedLimit.success && parsedLimit.data ? parsedLimit.data : 100);

  if (entityType) {
    query = query.eq("entity_type", entityType);
  }

  const { data: logs, error: logErr } = await query;

  if (logErr) {
    return { success: false, error: "Không thể tải nhật ký hoạt động." };
  }

  return { success: true, data: logs ?? [] };
}
