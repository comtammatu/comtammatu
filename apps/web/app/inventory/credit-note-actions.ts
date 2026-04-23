"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  PERMISSION_KEYS,
  SUPPLIER_CREDIT_NOTE_ROLES,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { withAction } from "@/_lib/with-action";
import { getAuthContextWithPermission } from "./_lib/auth";

const ROLES = SUPPLIER_CREDIT_NOTE_ROLES;

/* ─── fetchCreditNotes ─── */

export async function fetchCreditNotes(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("supplier_credit_notes")
    .select(
      "id, credit_number, kind, amount, applied_amount, status, created_at, applied_at, supplier_id, return_id, invoice_id, suppliers ( id, name ), supplier_returns ( id, return_number ), supplier_invoices ( id, invoice_number )",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: "Không thể tải credit notes." };
  return { success: true, data: data ?? [] };
}

/* ─── fetchOpenInvoicesForSupplier ─── */

export async function fetchOpenInvoicesForSupplier(
  supplierId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(supplierId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("supplier_invoices")
    .select(
      "id, invoice_number, invoice_date, total_amount, paid_amount, credit_applied_amount, payment_status, due_date",
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("supplier_id", id.data)
    .neq("payment_status", "paid")
    .order("invoice_date", { ascending: true });

  if (error) return { success: false, error: "Không thể tải hóa đơn NCC." };

  const filtered = (data ?? []).filter((inv) => {
    const total = Number(inv.total_amount ?? 0);
    const paid = Number(inv.paid_amount ?? 0);
    const credit = Number(inv.credit_applied_amount ?? 0);
    return total - paid - credit > 0;
  });
  return { success: true, data: filtered };
}

/* ─── applyCreditToInvoice ─── */

const applyCreditSchema = z.object({
  creditId: z.coerce.number().int().positive(),
  invoiceId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive({ error: "Số tiền phải > 0" }),
});

export const applyCreditToInvoice = withAction(
  {
    roles: ROLES,
    schema: applyCreditSchema,
    permission: PERMISSION_KEYS.FINANCE_AP_PAY,
  },
  async (data, { supabase }) => {
    const { data: result, error } = await supabase.rpc(
      "apply_credit_note_to_invoice",
      {
        p_credit_id: data.creditId,
        p_invoice_id: data.invoiceId,
        p_amount: data.amount,
      },
    );
    if (error) {
      console.error("applyCreditToInvoice", error);
      return { success: false, error: mapApplyError(error.message) };
    }
    revalidatePath("/inventory/supplier-credit-notes");
    revalidatePath("/inventory/supplier-invoices");
    return { success: true, data: result };
  },
);

function mapApplyError(raw: string | undefined): string {
  if (!raw) return "Không thể áp credit note.";
  if (raw.includes("forbidden")) return "Không có quyền (cần finance:ap_pay).";
  if (raw.includes("credit_not_found")) return "Không tìm thấy credit note.";
  if (raw.includes("invoice_not_found")) return "Không tìm thấy hóa đơn.";
  if (raw.includes("credit_not_open"))
    return "Credit note đã được áp hết hoặc đã hủy.";
  if (raw.includes("credit_kind_mismatch"))
    return "Chỉ credit_note mới áp được vào hóa đơn (cash_refund đã đóng khi phát hành).";
  if (raw.includes("supplier_mismatch"))
    return "Hóa đơn không thuộc cùng NCC với credit note.";
  if (raw.includes("amount_exceeds_credit"))
    return "Số tiền vượt quá phần credit còn lại.";
  if (raw.includes("amount_exceeds_invoice"))
    return "Số tiền vượt quá phần hóa đơn còn nợ.";
  if (raw.includes("invalid_amount")) return "Số tiền không hợp lệ.";
  return "Không thể áp credit note.";
}
