"use server";

import { z } from "zod";
import { randomUUID as _randomUUID } from "crypto";
import type { StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getInvoiceProvider } from "@comtammatu/shared/providers";
import {
  SYSTEM_SETTING_KEYS,
  SYSTEM_SETTING_DEFAULTS,
} from "@comtammatu/shared/settings";
import { ensureInvoiceProviderRegistered } from "../../../lib/invoice-provider-init";
import { getAuthContext } from "../_lib/auth";
import { canAccessBranch } from "../_lib/branch-scope";
import { logAudit } from "../_lib/audit";

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

const createInvoiceSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  buyerName: z.string().optional(),
  buyerTaxCode: z.string().optional(),
  buyerAddress: z.string().optional(),
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

  const ctx = await getAuthContext(INVOICE_CREATE_ROLES);
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
    return { success: false, error: "Không thể tạo hóa đơn." };
  }

  logAudit(supabase, {
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

export async function cancelTaxInvoice(
  invoiceId: number,
  reason?: string,
): Promise<ActionResult> {
  const parsedId = z.coerce.number().int().positive().safeParse(invoiceId);
  if (!parsedId.success) {
    return { success: false, error: "Invoice ID không hợp lệ" };
  }

  // Only owner/super_manager can cancel
  const ctx = await getAuthContext(FINANCE_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền hủy hóa đơn." };

  const { supabase, claims, user } = ctx;

  const { data: invoice, error: fetchErr } = await supabase
    .from("tax_invoices")
    .select("id, status, provider_ref, provider")
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (fetchErr || !invoice) {
    return { success: false, error: "Hóa đơn không tồn tại." };
  }

  if (invoice.status !== "issued") {
    return { success: false, error: "Chỉ có thể hủy hóa đơn đã phát hành." };
  }

  // Call provider cancel API if configured
  const cancelReason = reason ?? "Hủy theo yêu cầu";
  if (invoice.provider_ref && invoice.provider !== "mock") {
    ensureInvoiceProviderRegistered();
    const invoiceProvider = getInvoiceProvider();
    if (invoiceProvider) {
      try {
        await invoiceProvider.cancelInvoice(invoice.provider_ref, cancelReason);
      } catch {
        return {
          success: false,
          error: "Không thể hủy hóa đơn phía nhà cung cấp. Vui lòng thử lại.",
        };
      }
    }
  }

  const { error } = await supabase
    .from("tax_invoices")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      provider_data: { cancel_reason: cancelReason },
    })
    .eq("id", parsedId.data);

  if (error) {
    return { success: false, error: "Không thể hủy hóa đơn." };
  }

  logAudit(supabase, {
    tenantId: claims.tenant_id,
    userId: user.id,
    action: "cancel",
    entityType: "tax_invoice",
    entityId: parsedId.data,
    oldData: { status: "issued" },
    newData: { status: "cancelled", reason: cancelReason },
  });

  return { success: true };
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

  const ctx = await getAuthContext(FINANCE_ROLES);
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

  const ctx = await getAuthContext(REPORT_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("mv_daily_revenue")
    .select("*")
    .eq("branch_id", parsedBranch.data)
    .eq("tenant_id", claims.tenant_id)
    .gte("date", parsedStart.data)
    .lte("date", parsedEnd.data)
    .order("date");

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

  const ctx = await getAuthContext(REPORT_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("mv_top_items")
    .select("*")
    .eq("branch_id", parsedBranch.data)
    .eq("tenant_id", claims.tenant_id)
    .eq("period_start", parsedPeriod.data)
    .order("quantity_sold", { ascending: false })
    .limit(20);

  if (error) {
    return { success: false, error: "Không thể tải dữ liệu top món." };
  }

  return { success: true, data: data ?? [] };
}

/* ─── Food Cost ─── */

export async function fetchFoodCost(
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

  const ctx = await getAuthContext(REPORT_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error: fetchErr } = await supabase
    .from("mv_food_cost")
    .select("*")
    .eq("branch_id", parsedBranch.data)
    .eq("tenant_id", claims.tenant_id)
    .gte("period_start", parsedStart.data)
    .lte("period_start", parsedEnd.data)
    .order("food_cost_pct", { ascending: false });

  if (fetchErr) {
    return {
      success: false,
      error: "Không thể tải dữ liệu chi phí nguyên liệu.",
    };
  }

  return { success: true, data: data ?? [] };
}

/* ─── Refresh Materialized Views ─── */

export async function refreshMaterializedViews(): Promise<ActionResult> {
  const ctx = await getAuthContext(FINANCE_ROLES);
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

  const ctx = await getAuthContext(FINANCE_ROLES);
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
