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
  .refine(
    (v) => !v.buyerTaxCode || (v.buyerName && v.buyerName.length > 0),
    {
      error: "Có MST thì phải nhập tên người mua",
      path: ["buyerName"],
    },
  );

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

  const ctx = await getAuthContextWithPermission(INVOICE_CREATE_ROLES, PERMISSION_KEYS.ORDERS_WRITE);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims, user } = ctx;

  // Fetch order with line items — must be paid
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(
      "id, branch_id, subtotal, tax_amount, total_amount, payment_status, order_items(id, item_name, variant_name, quantity, unit_price, subtotal, status)",
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

  // Check no existing active invoice for this order
  const { data: existing } = await supabase
    .from("tax_invoices")
    .select("id")
    .eq("order_id", parsed.data.orderId)
    .eq("tenant_id", claims.tenant_id)
    .not("status", "in", '("cancelled","replaced")')
    .maybeSingle();

  if (existing) {
    return { success: false, error: "Đơn hàng đã có hóa đơn." };
  }

  // Read VAT rate from system_settings (falls back to default)
  const { data: vatSetting } = await supabase
    .from("system_settings")
    .select("value")
    .eq("tenant_id", claims.tenant_id)
    .eq("key", SYSTEM_SETTING_KEYS.VAT_RATE)
    .maybeSingle();
  const vatRate = Number(
    vatSetting?.value ?? SYSTEM_SETTING_DEFAULTS[SYSTEM_SETTING_KEYS.VAT_RATE],
  );
  const subtotal = Number(order.total_amount) / (1 + vatRate / 100);
  const vatAmount = Number(order.total_amount) - subtotal;

  // Use provider interface — swap MISA/ViettelSinvoice without changing this code
  ensureInvoiceProviderRegistered();
  const invoiceProvider = getInvoiceProvider();

  let invoiceNumber: string | null;
  let providerRef: string | null;
  let invoiceStatus: "draft" | "signing" | "submitted" | "issued";
  let providerData: Record<string, unknown> | undefined;

  // Build invoice line items from order_items (exclude cancelled)
  const activeItems = order.order_items.filter(
    (item) => item.status !== "cancelled",
  );

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
    tenantId: claims.tenant_id,
    userId: user.id,
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
    .min(20, "Lý do hủy phải có ít nhất 20 ký tự")
    .max(500, "Lý do hủy quá dài")
    .optional(),
});

export async function cancelTaxInvoice(
  invoiceId: number,
  reason?: string,
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

  const { supabase, claims, user } = ctx;

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

  const cancelReason = parsed.data.reason ?? "Hủy theo yêu cầu";

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
      return { success: false, error: "Trạng thái hóa đơn không cho phép hủy." };
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
    tenantId: claims.tenant_id,
    userId: user.id,
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

  const ctx = await getAuthContextWithPermission(FINANCE_ROLES, PERMISSION_KEYS.SETTINGS_TENANT);
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

  const ctx = await getAuthContextWithPermission(REPORT_ROLES, PERMISSION_KEYS.FINANCE_VIEW);
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

export async function fetchTopItems(
  branchId: number,
  periodStart: string,
): Promise<ActionResult> {
  const parsedBranch = z.coerce.number().int().positive().safeParse(branchId);
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

  const ctx = await getAuthContextWithPermission(REPORT_ROLES, PERMISSION_KEYS.FINANCE_VIEW);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  // RLS does not apply to materialized views — access goes through a
  // SECURITY DEFINER wrapper that re-checks tenant_id + branch + ACL.
  // See migration 20260427000000_secure_finance_mvs_revoke_grants.sql.
  const { data, error } = await supabase.rpc("get_top_items", {
    p_branch_id: parsedBranch.data,
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
  const ctx = await getAuthContextWithPermission(FINANCE_ROLES, PERMISSION_KEYS.SETTINGS_TENANT);
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

  const ctx = await getAuthContextWithPermission(FINANCE_ROLES, PERMISSION_KEYS.SETTINGS_TENANT);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  let query = supabase
    .from("audit_logs")
    .select("*")
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
