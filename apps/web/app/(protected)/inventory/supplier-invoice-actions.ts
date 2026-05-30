"use server";

import { z } from "zod";
import { PERMISSION_KEYS, PROCUREMENT_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { addVNDateDays } from "@comtammatu/shared/time";
import { withAction } from "@/_lib/with-action";
import { getAuthContextWithPermission } from "./_lib/auth";
import { PG_ERR } from "./_lib/constants";

const ROLES = PROCUREMENT_ROLES;

/* ─── Supplier Invoices (3-way match: PO ↔ GRN ↔ Invoice) ─── */

const invoiceSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  grnId: z.coerce.number().int().positive().optional().nullable(),
  poId: z.coerce.number().int().positive().optional().nullable(),
  invoiceNumber: z.string().min(1),
  invoiceDate: z.string(),
  subtotal: z.coerce.number().min(0),
  vatRate: z.coerce.number().min(0).default(8),
  vatAmount: z.coerce.number().min(0),
  totalAmount: z.coerce.number().min(0),
  matchingNotes: z.string().optional(),
  dueDate: z.string().optional().nullable(),
});

export const createSupplierInvoice = withAction(
  {
    roles: ROLES,
    schema: invoiceSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_INVOICE_CREATE,
  },
  async (data, { supabase, claims, user }) => {
    // Auto-compute due_date from supplier payment_terms_days if not provided
    let dueDate: string | null = data.dueDate ?? null;
    if (!dueDate) {
      const { data: supplier } = await supabase
        .from("suppliers")
        .select("payment_terms_days")
        .eq("id", data.supplierId)
        .eq("tenant_id", claims.tenant_id)
        .single();
      const termsDays = supplier?.payment_terms_days ?? null;
      if (termsDays && termsDays > 0) {
        dueDate = addVNDateDays(data.invoiceDate, termsDays);
      }
    }

    const { data: row, error } = await supabase
      .from("supplier_invoices")
      .insert({
        tenant_id: claims.tenant_id,
        supplier_id: data.supplierId,
        grn_id: data.grnId ?? null,
        po_id: data.poId ?? null,
        invoice_number: data.invoiceNumber,
        invoice_date: data.invoiceDate,
        subtotal: data.subtotal,
        vat_rate: data.vatRate,
        vat_amount: data.vatAmount,
        total_amount: data.totalAmount,
        matching_notes: data.matchingNotes ?? null,
        created_by: user.id,
        due_date: dueDate,
        payment_status: "unpaid",
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === PG_ERR.UNIQUE_VIOLATION) {
        return {
          success: false,
          error: "Số hóa đơn đã tồn tại cho NCC này.",
        };
      }
      return { success: false, error: "Không thể tạo hóa đơn NCC." };
    }

    // Auto-trigger 3-way matching (non-fatal — invoice creation still succeeds)
    if (row?.id) {
      const { error: matchErr } = await supabase.rpc(
        "recompute_supplier_invoice_matching",
        { p_invoice_id: row.id },
      );
      if (matchErr) {
        console.error(
          "[createSupplierInvoice] auto-matching failed:",
          matchErr.message,
        );
      }
    }

    return { success: true, data: row };
  },
);

export async function fetchSupplierInvoices(
  branchId?: number,
): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const grnSelect =
    branchId != null
      ? "goods_received_notes!inner ( id, grn_number, branch_id )"
      : "goods_received_notes ( id, grn_number )";
  let query = supabase
    .from("supplier_invoices")
    .select(
      `id, invoice_number, invoice_date, total_amount, matching_status, subtotal, supplier_id, grn_id, due_date, payment_status, paid_amount, paid_at, suppliers ( id, name ), ${grnSelect}`,
    )
    .eq("tenant_id", claims.tenant_id)
    .order("invoice_date", { ascending: false });
  if (branchId != null) {
    query = query.eq("goods_received_notes.branch_id", branchId);
  }
  const { data, error } = await query;
  if (error) return { success: false, error: "Không thể tải hóa đơn NCC." };
  return { success: true, data: data ?? [] };
}

export async function recomputeInvoiceMatching(
  invoiceId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(invoiceId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_INVOICE_MATCH,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;
  const { data, error } = await supabase.rpc(
    "recompute_supplier_invoice_matching",
    { p_invoice_id: id.data },
  );
  if (error) {
    console.error("recomputeInvoiceMatching", error);
    return { success: false, error: "Không thể tính khớp." };
  }
  return { success: true, data };
}
