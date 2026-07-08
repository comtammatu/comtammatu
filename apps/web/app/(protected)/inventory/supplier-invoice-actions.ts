"use server";

import { z } from "zod";
import {
  PERMISSION_KEYS,
  PROCUREMENT_ROLES,
  STAFF_ROLES,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { addVNDateDays } from "@comtammatu/shared/time";
import { withAction } from "@/_lib/with-action";
import { getAuthContextWithPermission } from "./_lib/auth";
import { PG_ERR } from "./_lib/constants";

const ROLES = PROCUREMENT_ROLES;

/* ─── Supplier Invoices (3-way match: PO ↔ GRN ↔ Invoice) ─── */

const invoiceSchema = z
  .object({
    supplierId: z.coerce.number().int().positive(),
    grnId: z.coerce.number().int().positive().optional().nullable(),
    poId: z.coerce.number().int().positive().optional().nullable(),
    invoiceNumber: z.string().min(1),
    invoiceDate: z.string(),
    subtotal: z.coerce.number().min(0),
    // HKD does not deduct input VAT by default (einvoice-tax.md §4.1/§4.3) —
    // the field stays editable for cost/reconciliation, but the system must
    // not presume the supplier charged 8%.
    vatRate: z.coerce.number().min(0).default(0),
    vatAmount: z.coerce.number().min(0),
    totalAmount: z.coerce.number().min(0),
    matchingNotes: z.string().optional(),
    dueDate: z.string().optional().nullable(),
  })
  .refine((d) => Math.abs(d.totalAmount - (d.subtotal + d.vatAmount)) <= 1, {
    message: "Tổng tiền phải bằng tạm tính cộng thuế GTGT.",
    path: ["totalAmount"],
  });

const supplierPaymentSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  amount: z.coerce
    .number()
    .positive({ error: "Số tiền thanh toán phải lớn hơn 0." }),
  paymentMethod: z.enum(["cash", "bank_transfer"]),
  referenceNote: z.string().trim().max(500).optional(),
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
        console.error("inventory.supplier_invoice.auto_matching_failed", {
          error:
            matchErr instanceof Error ? matchErr.message : String(matchErr),
        });
      }
    }

    return { success: true, data: row };
  },
);

export const recordSupplierPayment = withAction(
  {
    roles: STAFF_ROLES,
    schema: supplierPaymentSchema,
    permission: PERMISSION_KEYS.FINANCE_AP_PAY,
    forbiddenError: "Không có quyền thanh toán công nợ NCC.",
  },
  async (data, { supabase, claims }) => {
    const { data: payment, error } = await supabase.rpc(
      "create_supplier_payment",
      {
        p_tenant_id: claims.tenant_id,
        p_supplier_invoice_id: data.invoiceId,
        p_amount: data.amount,
        p_payment_method: data.paymentMethod,
        p_reference_note: data.referenceNote?.trim() || undefined,
      },
    );

    if (error) {
      const message = error.message ?? "";
      if (error.code === "42501") {
        return {
          success: false,
          error: "Không có quyền thanh toán công nợ NCC.",
        };
      }
      if (message.includes("invoice_already_paid")) {
        return { success: false, error: "Hóa đơn đã thanh toán đủ." };
      }
      if (message.includes("payment_exceeds_invoice_total")) {
        return {
          success: false,
          error: "Số tiền trả vượt quá phần còn phải trả.",
        };
      }
      if (message.includes("invoice_missing_grn_for_payment")) {
        return {
          success: false,
          error: "Cần liên kết phiếu nhập trước khi thanh toán NCC.",
        };
      }
      if (message.includes("invoice_not_matched_for_payment")) {
        return {
          success: false,
          error: "Cần đối soát khớp hóa đơn với phiếu nhập trước khi thanh toán.",
        };
      }
      if (message.includes("invalid_payment_method")) {
        return {
          success: false,
          error: "Phương thức thanh toán không hợp lệ.",
        };
      }
      return { success: false, error: "Không thể ghi nhận thanh toán NCC." };
    }

    return { success: true, data: payment };
  },
);

const supplierInvoiceSelect = (branchId?: number) => {
  const grnSelect =
    branchId != null
      ? "goods_received_notes!inner ( id, grn_number, branch_id )"
      : "goods_received_notes ( id, grn_number )";
  return `id, invoice_number, invoice_date, total_amount, matching_status, subtotal, supplier_id, grn_id, po_id, due_date, payment_status, paid_amount, paid_at, suppliers ( id, name ), purchase_orders ( id, po_number ), ${grnSelect}`;
};

const SUPPLIER_INVOICE_PAGE_SIZE = 50;

export interface SupplierInvoiceCursor {
  invoiceDate: string;
  id: number;
}

export interface SupplierInvoicePage {
  items: unknown[];
  hasMore: boolean;
  nextCursor: SupplierInvoiceCursor | null;
}

const supplierInvoiceCursorSchema = z.object({
  invoiceDate: z.string(),
  id: z.coerce.number().int().positive(),
});

const fetchSupplierInvoicesPaginatedSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  before: supplierInvoiceCursorSchema.optional(),
  pageSize: z.coerce
    .number()
    .int()
    .positive()
    .max(200)
    .optional()
    .default(SUPPLIER_INVOICE_PAGE_SIZE),
});

/**
 * Keyset-paginated supplier-invoice list (invoice_date desc, id desc
 * tiebreaker). invoice_date is a NOT NULL timestamptz with frequent ties,
 * so the id tiebreaker is required for stable paging. Mirrors
 * fetchArchivedOrders: fetch pageSize+1 to probe hasMore, slice to
 * pageSize, expose the last row as nextCursor. Scoped to tenant + optional
 * branch (branch filter rides the GRN relationship).
 */
export async function fetchSupplierInvoicesPage(
  input: z.input<typeof fetchSupplierInvoicesPaginatedSchema> = {},
): Promise<ActionResult<SupplierInvoicePage>> {
  const parsed = fetchSupplierInvoicesPaginatedSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Tham số tải hóa đơn không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { branchId, before, pageSize } = parsed.data;

  let query = supabase
    .from("supplier_invoices")
    .select(supplierInvoiceSelect(branchId))
    .eq("tenant_id", claims.tenant_id);

  if (branchId != null) {
    query = query.eq("goods_received_notes.branch_id", branchId);
  }

  if (before) {
    // Keyset: rows STRICTLY after the cursor under (invoice_date desc, id desc).
    // PostgREST has no composite "<", so OR two disjoint half-spaces:
    //   invoice_date < cursor.invoiceDate
    //   OR (invoice_date = cursor.invoiceDate AND id < cursor.id)
    query = query.or(
      `invoice_date.lt.${before.invoiceDate},and(invoice_date.eq.${before.invoiceDate},id.lt.${String(before.id)})`,
    );
  }

  const { data, error } = await query
    .order("invoice_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (error) return { success: false, error: "Không thể tải hóa đơn NCC." };

  const fetched = (data ?? []) as unknown as Array<{
    id: number;
    invoice_date: string;
    [k: string]: unknown;
  }>;
  const hasMore = fetched.length > pageSize;
  const items = hasMore ? fetched.slice(0, pageSize) : fetched;
  const last = items.at(-1);
  const nextCursor =
    hasMore && last !== undefined
      ? { invoiceDate: last.invoice_date, id: last.id }
      : null;

  return { success: true, data: { items, hasMore, nextCursor } };
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
    console.error("inventory.supplier_invoice.recompute_matching_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: "Không thể tính khớp." };
  }
  return { success: true, data };
}
