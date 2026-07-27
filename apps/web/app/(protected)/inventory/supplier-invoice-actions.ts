"use server";

import { z } from "zod";
import {
  MODULE_ACL,
  PERMISSION_KEYS,
  PROCUREMENT_ROLES,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getVNDateString } from "@comtammatu/shared/time";
import { withAction } from "@/_lib/with-action";
import { messages } from "@lib/messages";
import { getAuthContextWithPermission } from "./_lib/auth";
import { PG_ERR } from "./_lib/constants";
import {
  filterSupplierInvoices,
  groupSupplierInvoices,
  SUPPLIER_INVOICE_MATCH_STATUSES,
  SUPPLIER_INVOICE_PAYMENT_STATUSES,
  SUPPLIER_INVOICE_VIEW_MODES,
  type SupplierInvoiceGroup,
  type SupplierInvoiceListFilters,
} from "./supplier-invoices/supplier-invoice-list-model";
import { mapSupplierInvoiceRow } from "./supplier-invoices/supplier-invoice-row";

const ROLES = PROCUREMENT_ROLES;

/* ─── Supplier Invoices (3-way match: PO ↔ GRN ↔ Invoice) ─── */

const supplierInvoiceVatLineSchema = z.object({
  vatRate: z.coerce.number().refine((value) => [0, 5, 8, 10].includes(value), {
    error: "Thuế GTGT không hợp lệ.",
  }),
  taxableAmount: z.coerce.number().positive(),
  vatAmount: z.coerce.number().min(0),
});

const invoiceSchema = z
  .object({
    supplierId: z.coerce.number().int().positive(),
    grnId: z.coerce.number().int().positive().optional().nullable(),
    poId: z.coerce.number().int().positive().optional().nullable(),
    invoiceNumber: z.string().min(1),
    invoiceDate: z.string(),
    vatBreakdown: z.array(supplierInvoiceVatLineSchema).min(1).max(4),
    matchingNotes: z.string().optional(),
    dueDate: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const rates = new Set<number>();
    for (const [index, line] of data.vatBreakdown.entries()) {
      if (rates.has(line.vatRate)) {
        ctx.addIssue({
          code: "custom",
          message: "Mỗi mức thuế GTGT chỉ được nhập một lần.",
          path: ["vatBreakdown", index, "vatRate"],
        });
      }
      if (line.vatRate === 0 && line.vatAmount !== 0) {
        ctx.addIssue({
          code: "custom",
          message: "Mức thuế 0% phải có tiền thuế bằng 0.",
          path: ["vatBreakdown", index, "vatAmount"],
        });
      }
      rates.add(line.vatRate);
    }
  });

type CreateSupplierInvoiceRpcClient = {
  rpc: (
    fn: "create_supplier_invoice_with_vat_breakdown",
    args: {
      p_supplier_id: number;
      p_grn_id: number | null;
      p_po_id: number | null;
      p_invoice_number: string;
      p_invoice_date: string;
      p_vat_breakdown: Array<{
        vat_rate: number;
        taxable_amount: number;
        vat_amount: number;
      }>;
      p_matching_notes: string | null;
      p_due_date: string | null;
    },
  ) => PromiseLike<{
    data: number | null;
    error: { code?: string; message?: string } | null;
  }>;
};

const supplierPaymentSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  idempotencyKey: z.string().uuid(),
  amount: z.coerce
    .number()
    .positive({ error: "Số tiền thanh toán phải lớn hơn 0." }),
  paymentMethod: z.enum(["cash", "bank_transfer"]),
  referenceNote: z.string().trim().max(500).optional(),
});

const attachVatEvidenceSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  storagePath: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((value) => !value.includes("..") && !/\s/.test(value), {
      error: "Đường dẫn file HĐ GTGT không hợp lệ.",
    }),
});

const SUPPLIER_INVOICE_VAT_BUCKET = "supplier-invoice-attachments";

export const createSupplierInvoice = withAction(
  {
    roles: ROLES,
    schema: invoiceSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_INVOICE_CREATE,
  },
  async (data, { supabase }) => {
    const { data: invoiceId, error } = await (
      supabase as unknown as CreateSupplierInvoiceRpcClient
    ).rpc("create_supplier_invoice_with_vat_breakdown", {
      p_supplier_id: data.supplierId,
      p_grn_id: data.grnId ?? null,
      p_po_id: data.poId ?? null,
      p_invoice_number: data.invoiceNumber,
      p_invoice_date: data.invoiceDate,
      p_vat_breakdown: data.vatBreakdown.map((line) => ({
        vat_rate: line.vatRate,
        taxable_amount: line.taxableAmount,
        vat_amount: line.vatAmount,
      })),
      p_matching_notes: data.matchingNotes ?? null,
      p_due_date: data.dueDate ?? null,
    });
    if (error) {
      if (error.code === PG_ERR.UNIQUE_VIOLATION) {
        return {
          success: false,
          error: "Số hóa đơn đã tồn tại cho NCC này.",
        };
      }
      if (error.code === "42501") {
        return {
          success: false,
          error: "Không có quyền tạo hóa đơn NCC.",
        };
      }
      if (error.message?.includes("grn_not_confirmed")) {
        return {
          success: false,
          error: "Chỉ liên kết hóa đơn với phiếu nhập đã xác nhận.",
        };
      }
      if (error.message?.includes("grn_supplier_mismatch")) {
        return {
          success: false,
          error: "Nhà cung cấp không khớp với phiếu nhập.",
        };
      }
      if (error.message?.includes("supplier_invoice_vat_breakdown")) {
        return {
          success: false,
          error: "Chi tiết thuế GTGT của hóa đơn không hợp lệ.",
        };
      }
      return { success: false, error: "Không thể tạo hóa đơn NCC." };
    }

    // Auto-trigger 3-way matching (non-fatal — invoice creation still succeeds)
    if (invoiceId) {
      const { error: matchErr } = await supabase.rpc(
        "recompute_supplier_invoice_matching",
        { p_invoice_id: invoiceId },
      );
      if (matchErr) {
        console.error("inventory.supplier_invoice.auto_matching_failed", {
          error:
            matchErr instanceof Error ? matchErr.message : String(matchErr),
        });
      }
    }

    return { success: true, data: { id: Number(invoiceId) } };
  },
);

export const recordSupplierPayment = withAction(
  {
    roles: MODULE_ACL.finance.allowedRoles,
    schema: supplierPaymentSchema,
    permission: PERMISSION_KEYS.FINANCE_AP_PAY,
    forbiddenError: "Không có quyền thanh toán công nợ NCC.",
  },
  async (data, { supabase, claims }) => {
    const { data: payment, error } = await supabase.rpc(
      "record_supplier_payment",
      {
        p_tenant_id: claims.tenant_id,
        p_supplier_invoice_id: data.invoiceId,
        p_amount: data.amount,
        p_payment_method: data.paymentMethod,
        p_idempotency_key: data.idempotencyKey,
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
      if (message.includes("supplier_payment_idempotency_conflict")) {
        return {
          success: false,
          error:
            "Lần thanh toán này đã được dùng với dữ liệu khác. Hãy đóng và mở lại biểu mẫu.",
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
          error:
            "Cần đối soát khớp hóa đơn với phiếu nhập trước khi thanh toán.",
        };
      }
      if (message.includes("vat_invoice_attachment_required")) {
        return {
          success: false,
          error:
            "Vui lòng đính kèm ít nhất 1 file HĐ GTGT trước khi ghi nhận thanh toán.",
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

export const attachSupplierInvoiceVatEvidence = withAction(
  {
    roles: MODULE_ACL.finance.allowedRoles,
    schema: attachVatEvidenceSchema,
    anyPermission: [
      PERMISSION_KEYS.FINANCE_AP_PAY,
      PERMISSION_KEYS.PROCUREMENT_INVOICE_CREATE,
    ],
    forbiddenError: "Không có quyền đính kèm HĐ GTGT.",
  },
  async (data, { supabase, claims }) => {
    const tenantPrefix = `${claims.tenant_id}/`;
    if (!data.storagePath.startsWith(tenantPrefix)) {
      return {
        success: false,
        error: "File HĐ GTGT không thuộc tenant hiện tại.",
      };
    }

    const { error } = await supabase.rpc(
      "attach_supplier_invoice_vat_evidence",
      {
        p_invoice_id: data.invoiceId,
        p_storage_path: data.storagePath,
      },
    );

    if (error) {
      const message = error.message ?? "";
      if (error.code === "42501") {
        return { success: false, error: "Không có quyền đính kèm HĐ GTGT." };
      }
      if (message.includes("invoice_not_found")) {
        return { success: false, error: "Không tìm thấy hóa đơn NCC." };
      }
      if (
        message.includes("invalid_vat_invoice_attachment") ||
        message.includes("vat_invoice_attachment_tenant_mismatch")
      ) {
        return {
          success: false,
          error: "File HĐ GTGT không hợp lệ.",
        };
      }
      return { success: false, error: "Không thể đính kèm HĐ GTGT." };
    }

    return {
      success: true,
      data: {
        invoiceId: data.invoiceId,
        storagePath: data.storagePath,
        bucket: SUPPLIER_INVOICE_VAT_BUCKET,
      },
    };
  },
);

const supplierInvoiceSelect = (branchId?: number) => {
  const grnSelect =
    branchId != null
      ? "goods_received_notes!inner ( id, grn_number, branch_id )"
      : "goods_received_notes ( id, grn_number )";
  return `id, invoice_number, invoice_date, subtotal, vat_rate, vat_amount, vat_breakdown, vat_invoice_attachment_path, total_amount, matching_status, supplier_id, grn_id, po_id, due_date, payment_status, paid_amount, credit_applied_amount, paid_at, suppliers ( id, name ), purchase_orders ( id, po_number ), supplier_payments ( id, amount, payment_method, payment_date, reference_note ), ${grnSelect}`;
};

const SUPPLIER_INVOICE_PAGE_SIZE = 50;
const SUPPLIER_INVOICE_SCAN_PAGE_SIZE = 500;

export interface SupplierInvoiceCursor {
  invoiceDate: string;
  id: number;
}

export interface SupplierInvoicePage {
  items: unknown[];
  hasMore: boolean;
  nextCursor: SupplierInvoiceCursor | null;
  totalCount: number;
  groups: SupplierInvoiceGroup[];
}

const supplierInvoiceCursorSchema = z.object({
  invoiceDate: z.string(),
  id: z.coerce.number().int().positive(),
});

const fetchSupplierInvoicesPaginatedSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  invoiceId: z.coerce.number().int().positive().optional(),
  query: z.string().trim().max(200).optional().default(""),
  supplierId: z.coerce.number().int().positive().optional(),
  matchStatus: z.enum(SUPPLIER_INVOICE_MATCH_STATUSES).optional(),
  paymentStatus: z.enum(SUPPLIER_INVOICE_PAYMENT_STATUSES).optional(),
  overdueOnly: z.boolean().optional().default(false),
  viewMode: z.enum(SUPPLIER_INVOICE_VIEW_MODES).optional().default("supplier"),
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
 * Server-filtered supplier-invoice list. The tenant/branch result is scanned
 * with an internal keyset so search and aggregate truth cover unloaded rows;
 * the public cursor only controls which matching rows are presented next.
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
  const {
    branchId,
    invoiceId,
    query: queryText,
    supplierId,
    matchStatus,
    paymentStatus,
    overdueOnly,
    viewMode,
    before,
    pageSize,
  } = parsed.data;
  const fetched: Array<{
    id: number;
    invoice_date: string;
    [k: string]: unknown;
  }> = [];
  let scanBefore: SupplierInvoiceCursor | null = null;

  while (true) {
    let query = supabase
      .from("supplier_invoices")
      .select(supplierInvoiceSelect(branchId))
      .eq("tenant_id", claims.tenant_id);

    if (branchId != null) {
      query = query.eq("goods_received_notes.branch_id", branchId);
    }

    if (invoiceId != null) {
      query = query.eq("id", invoiceId);
    }

    if (scanBefore) {
      query = query.or(
        `invoice_date.lt.${scanBefore.invoiceDate},and(invoice_date.eq.${scanBefore.invoiceDate},id.lt.${String(scanBefore.id)})`,
      );
    }

    const { data, error } = await query
      .order("invoice_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(SUPPLIER_INVOICE_SCAN_PAGE_SIZE);

    if (error) {
      return {
        success: false,
        error: messages.inventory.supplierInvoices.loadFailed,
      };
    }

    const batch = (data ?? []) as unknown as typeof fetched;
    fetched.push(...batch);
    if (batch.length < SUPPLIER_INVOICE_SCAN_PAGE_SIZE) break;

    const last = batch.at(-1);
    if (!last) break;
    scanBefore = { invoiceDate: last.invoice_date, id: last.id };
  }

  const filters: SupplierInvoiceListFilters = {
    query: queryText,
    supplierId: supplierId ?? null,
    matchStatus: matchStatus ?? null,
    paymentStatus: paymentStatus ?? null,
    overdueOnly,
    viewMode,
  };
  const today = getVNDateString();
  const mapped = fetched.map(mapSupplierInvoiceRow);
  const filtered =
    invoiceId != null ? mapped : filterSupplierInvoices(mapped, filters, today);
  const afterCursor = before
    ? filtered.filter((invoice) => {
        const invoiceDate = invoice.invoiceDate;
        if (invoiceDate == null) return false;
        return (
          invoiceDate < before.invoiceDate ||
          (invoiceDate === before.invoiceDate && invoice.id < before.id)
        );
      })
    : filtered;
  const pageRows = afterCursor.slice(0, pageSize + 1);
  const hasMore = pageRows.length > pageSize;
  const visibleRows = hasMore ? pageRows.slice(0, pageSize) : pageRows;
  const rawById = new Map(fetched.map((row) => [row.id, row]));
  const items = visibleRows.flatMap((row) => {
    const raw = rawById.get(row.id);
    return raw ? [raw] : [];
  });
  const last = visibleRows.at(-1);
  const nextCursor =
    hasMore && last?.invoiceDate != null
      ? { invoiceDate: last.invoiceDate, id: last.id }
      : null;

  return {
    success: true,
    data: {
      items,
      hasMore,
      nextCursor,
      totalCount: filtered.length,
      groups: groupSupplierInvoices(filtered, viewMode, today),
    },
  };
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
