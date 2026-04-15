"use server";

import { z } from "zod";
import type { StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "./_lib/auth";

const FINANCE_ROLES: readonly StaffRole[] = ["owner", "super_manager"];

/* ─── Create Supplier Payment ─── */

const createSupplierPaymentSchema = z.object({
  supplierInvoiceId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
  paymentMethod: z.enum(["cash", "bank_transfer"]),
  referenceNote: z.string().max(500).optional(),
});

export async function createSupplierPayment(
  input: z.infer<typeof createSupplierPaymentSchema>,
): Promise<ActionResult> {
  const parsed = createSupplierPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(FINANCE_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: rpcError } = await (supabase as any).rpc(
    "create_supplier_payment",
    {
      p_tenant_id: claims.tenant_id,
      p_supplier_invoice_id: parsed.data.supplierInvoiceId,
      p_amount: parsed.data.amount,
      p_payment_method: parsed.data.paymentMethod,
      p_reference_note: parsed.data.referenceNote ?? null,
    },
  );

  if (rpcError) {
    const msg = rpcError.message ?? "";
    if (msg.includes("invoice_not_found")) {
      return { success: false, error: "Hóa đơn không tồn tại." };
    }
    if (msg.includes("invoice_already_paid")) {
      return { success: false, error: "Hóa đơn đã thanh toán." };
    }
    if (msg.includes("payment_exceeds_invoice_total")) {
      return { success: false, error: "Số tiền vượt quá tổng hóa đơn." };
    }
    return { success: false, error: "Không thể tạo thanh toán NCC." };
  }

  return { success: true, data };
}

/* ─── Fetch Supplier Payments ─── */

export async function fetchSupplierPayments(
  supplierInvoiceId: number,
): Promise<ActionResult> {
  const parsedId = z.coerce.number().int().positive().safeParse(supplierInvoiceId);
  if (!parsedId.success) {
    return { success: false, error: "ID không hợp lệ" };
  }

  const ctx = await getAuthContext(FINANCE_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // supplier_payments table added in gl_supplier_payments migration — cast until db:types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("supplier_payments")
    .select("id, payment_method, amount, payment_date, reference_note, journal_entry_id")
    .eq("tenant_id", claims.tenant_id)
    .eq("supplier_invoice_id", parsedId.data)
    .order("payment_date", { ascending: false });

  if (error) {
    return { success: false, error: "Không thể tải lịch sử thanh toán." };
  }

  return { success: true, data: data ?? [] };
}
