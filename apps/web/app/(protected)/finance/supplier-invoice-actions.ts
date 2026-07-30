"use server";

import { z } from "zod";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getVNDateString } from "@comtammatu/shared/time";
import { withAction } from "@/_lib/with-action";
import { messages } from "@lib/messages";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { canAccessBranch } from "@/_lib/branch-scope";
import { loadInventoryMonetaryAccess } from "@lib/inventory/monetary-access";
import { PG_ERR } from "@/(protected)/inventory/_lib/constants";
import {
  filterSupplierInvoices,
  groupSupplierInvoices,
  SUPPLIER_INVOICE_MATCH_STATUSES,
  SUPPLIER_INVOICE_PAYMENT_STATUSES,
  SUPPLIER_INVOICE_VAT_EVIDENCE_FILTERS,
  SUPPLIER_INVOICE_VIEW_MODES,
  type SupplierInvoiceGroup,
  type SupplierInvoiceListFilters,
} from "./supplier-invoices/supplier-invoice-list-model";
import { mapSupplierInvoiceRow } from "./supplier-invoices/supplier-invoice-row";

const ROLES = MODULE_ACL.finance.allowedRoles;

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
    invoiceKind: z.enum(["goods", "service"]).default("goods"),
    supplierId: z.coerce.number().int().positive(),
    grnId: z.coerce.number().int().positive().optional().nullable(),
    poId: z.coerce.number().int().positive().optional().nullable(),
    receiptAllocations: z
      .array(
        z.object({
          grnId: z.coerce.number().int().positive(),
          poId: z.coerce.number().int().positive(),
        }),
      )
      .max(200)
      .optional(),
    invoiceNumber: z.string().min(1),
    invoiceDate: z.string(),
    vatBreakdown: z.array(supplierInvoiceVatLineSchema).min(1).max(4),
    matchingNotes: z.string().optional(),
    dueDate: z.string().optional().nullable(),
    documentDiscountAmount: z.coerce
      .number()
      .nonnegative()
      .optional()
      .default(0),
  })
  .superRefine((data, ctx) => {
    const receiptCount =
      data.receiptAllocations?.length ??
      (data.grnId != null && data.poId != null ? 1 : 0);
    if (data.invoiceKind === "goods" && receiptCount === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Hóa đơn hàng hóa phải liên kết ít nhất một phiếu nhập.",
        path: ["receiptAllocations"],
      });
    }
    if (data.invoiceKind === "service" && receiptCount > 0) {
      ctx.addIssue({
        code: "custom",
        message: "Hóa đơn dịch vụ không liên kết phiếu nhập.",
        path: ["receiptAllocations"],
      });
    }
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
    fn: "create_supplier_invoice_with_allocations",
    args: {
      p_supplier_id: number;
      p_invoice_number: string;
      p_invoice_date: string;
      p_vat_breakdown: Array<{
        vat_rate: number;
        taxable_amount: number;
        vat_amount: number;
      }>;
      p_matching_notes: string | null;
      p_due_date: string | null;
      p_document_discount_amount: number;
      p_receipts: Array<{ grn_id: number; po_id: number }>;
      p_invoice_kind: "goods" | "service";
    },
  ) => PromiseLike<{
    data: number | null;
    error: { code?: string; message?: string } | null;
  }>;
};

const supplierPaymentSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  supplierId: z.coerce.number().int().positive().optional(),
  allocations: z
    .array(
      z.object({
        invoiceId: z.coerce.number().int().positive(),
        amount: z.coerce.number().positive(),
      }),
    )
    .min(1)
    .max(200)
    .optional(),
  idempotencyKey: z.string().uuid(),
  amount: z.coerce
    .number()
    .positive({ error: "Số tiền thanh toán phải lớn hơn 0." }),
  paymentMethod: z.enum(["cash", "bank_transfer"]),
  referenceNote: z.string().trim().max(500).optional(),
});

const supplierAdvanceSchema = z.object({
  paymentId: z.coerce.number().int().positive(),
  idempotencyKey: z.string().uuid(),
  allocations: z
    .array(
      z.object({
        invoiceId: z.coerce.number().int().positive(),
        amount: z.coerce.number().positive(),
      }),
    )
    .min(1)
    .max(200),
});

const supplierPaymentResultSchema = z.object({
  payment_id: z.coerce.number().int().positive(),
  allocated_amount: z.coerce.number().nonnegative(),
  advance_amount: z.coerce.number().nonnegative(),
  payment_status: z.string(),
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

const supplierCreditSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  creditNumber: z.string().trim().min(1).max(100),
  amount: z.coerce.number().positive(),
  notes: z
    .string()
    .trim()
    .min(5, "Lý do giảm công nợ phải có ít nhất 5 ký tự")
    .max(500),
  allocations: z
    .array(
      z.object({
        invoiceId: z.coerce.number().int().positive(),
        amount: z.coerce.number().positive(),
      }),
    )
    .min(1)
    .max(200),
});

const acceptDiscrepancySchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(5).max(500),
});

const verifyServiceInvoiceSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(5).max(500),
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
    ).rpc("create_supplier_invoice_with_allocations", {
      p_supplier_id: data.supplierId,
      p_invoice_number: data.invoiceNumber,
      p_invoice_date: data.invoiceDate,
      p_vat_breakdown: data.vatBreakdown.map((line) => ({
        vat_rate: line.vatRate,
        taxable_amount: line.taxableAmount,
        vat_amount: line.vatAmount,
      })),
      p_matching_notes: data.matchingNotes ?? null,
      p_due_date: data.dueDate ?? null,
      p_document_discount_amount: data.documentDiscountAmount,
      p_invoice_kind: data.invoiceKind,
      p_receipts:
        data.receiptAllocations?.map((allocation) => ({
          grn_id: allocation.grnId,
          po_id: allocation.poId,
        })) ??
        (data.grnId != null && data.poId != null
          ? [{ grn_id: data.grnId, po_id: data.poId }]
          : []),
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
      if (error.message?.includes("supplier_invoice_receipt_mismatch")) {
        return {
          success: false,
          error: "Các phiếu nhập phải đã xác nhận và thuộc cùng nhà cung cấp.",
        };
      }
      if (error.message?.includes("goods_invoice_receipts_required")) {
        return {
          success: false,
          error: "Hóa đơn hàng hóa phải liên kết ít nhất một phiếu nhập.",
        };
      }
      if (error.message?.includes("service_invoice_receipts_forbidden")) {
        return {
          success: false,
          error: "Hóa đơn dịch vụ không được liên kết phiếu nhập.",
        };
      }
      if (error.message?.includes("po_grn_mismatch")) {
        return {
          success: false,
          error: "Đơn mua không khớp với phiếu nhập đã chọn.",
        };
      }
      if (error.message?.includes("po_supplier_mismatch")) {
        return {
          success: false,
          error: "Đơn mua không khớp với nhà cung cấp.",
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

    return { success: true, data: { id: Number(invoiceId) } };
  },
);

export const recordSupplierPayment = withAction(
  {
    roles: ["owner"] as const,
    schema: supplierPaymentSchema,
    permission: PERMISSION_KEYS.FINANCE_AP_PAY,
    forbiddenError: "Không có quyền thanh toán công nợ NCC.",
  },
  async (data, { supabase, claims }) => {
    const allocations = data.allocations ?? [
      { invoiceId: data.invoiceId, amount: data.amount },
    ];
    const { data: invoice, error: invoiceError } = await supabase
      .from("supplier_invoices")
      .select("supplier_id")
      .eq("tenant_id", claims.tenant_id)
      .eq("id", allocations[0]!.invoiceId)
      .maybeSingle();
    if (invoiceError || !invoice) {
      return { success: false, error: "Không tìm thấy hóa đơn NCC." };
    }
    const { data: payment, error } = await supabase.rpc(
      "record_supplier_payment_allocated" as never,
      {
        p_tenant_id: claims.tenant_id,
        p_supplier_id: data.supplierId ?? invoice.supplier_id,
        p_amount: data.amount,
        p_payment_method: data.paymentMethod,
        p_idempotency_key: data.idempotencyKey,
        p_reference_note: data.referenceNote?.trim() || null,
        p_allocations: allocations.map((allocation) => ({
          invoice_id: allocation.invoiceId,
          amount: allocation.amount,
        })),
      } as never,
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
      if (message.includes("supplier_payment_allocation_invalid")) {
        return {
          success: false,
          error:
            "Phân bổ thanh toán không hợp lệ hoặc có hóa đơn chưa đủ điều kiện.",
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

    const parsedPayment = supplierPaymentResultSchema.safeParse(payment);
    if (!parsedPayment.success) {
      return { success: false, error: "Không thể đọc kết quả thanh toán NCC." };
    }
    return {
      success: true,
      data: {
        paymentId: parsedPayment.data.payment_id,
        allocatedAmount: parsedPayment.data.allocated_amount,
        advanceAmount: parsedPayment.data.advance_amount,
        paymentStatus: parsedPayment.data.payment_status,
      },
    };
  },
);

export const allocateSupplierAdvance = withAction(
  {
    roles: ["owner"] as const,
    schema: supplierAdvanceSchema,
    permission: PERMISSION_KEYS.FINANCE_AP_PAY,
    forbiddenError: "Không có quyền phân bổ ứng trước NCC.",
  },
  async (data, { supabase }) => {
    const { data: result, error } = await supabase.rpc(
      "allocate_supplier_advance" as never,
      {
        p_payment_id: data.paymentId,
        p_idempotency_key: data.idempotencyKey,
        p_allocations: data.allocations.map((allocation) => ({
          invoice_id: allocation.invoiceId,
          amount: allocation.amount,
        })),
      } as never,
    );

    if (error) {
      const message = error.message ?? "";
      if (error.code === "42501") {
        return {
          success: false,
          error: "Không có quyền phân bổ ứng trước NCC.",
        };
      }
      if (message.includes("supplier_payment_not_found")) {
        return { success: false, error: "Không tìm thấy khoản ứng trước NCC." };
      }
      if (message.includes("supplier_advance_idempotency_conflict")) {
        return {
          success: false,
          error:
            "Lần phân bổ này đã được dùng với dữ liệu khác. Hãy đóng và mở lại biểu mẫu.",
        };
      }
      if (message.includes("supplier_advance_allocation_invalid")) {
        return {
          success: false,
          error:
            "Phân bổ ứng trước vượt số dư hoặc có hóa đơn chưa đủ điều kiện.",
        };
      }
      return { success: false, error: "Không thể phân bổ ứng trước NCC." };
    }

    const parsedResult = supplierPaymentResultSchema.safeParse(result);
    if (!parsedResult.success) {
      return {
        success: false,
        error: "Không thể đọc kết quả phân bổ ứng trước.",
      };
    }
    return {
      success: true,
      data: {
        paymentId: parsedResult.data.payment_id,
        allocatedAmount: parsedResult.data.allocated_amount,
        advanceAmount: parsedResult.data.advance_amount,
        paymentStatus: parsedResult.data.payment_status,
      },
    };
  },
);

export const createSupplierCreditAllocated = withAction(
  {
    roles: ROLES,
    schema: supplierCreditSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_INVOICE_MATCH,
  },
  async (data, { supabase }) => {
    const { data: result, error } = await supabase.rpc(
      "create_supplier_credit_allocated" as never,
      {
        p_supplier_id: data.supplierId,
        p_credit_number: data.creditNumber,
        p_amount: data.amount,
        p_notes: data.notes,
        p_allocations: data.allocations.map((allocation) => ({
          invoice_id: allocation.invoiceId,
          amount: allocation.amount,
        })),
      } as never,
    );
    if (error) {
      if (error.code === PG_ERR.UNIQUE_VIOLATION) {
        return {
          success: false,
          error: "Số phiếu giảm công nợ đã tồn tại.",
        };
      }
      return {
        success: false,
        error: "Không thể ghi nhận phiếu giảm công nợ.",
      };
    }
    return { success: true, data: result };
  },
);

export const acceptSupplierInvoiceDiscrepancy = withAction(
  {
    roles: ROLES,
    schema: acceptDiscrepancySchema,
    permission: PERMISSION_KEYS.PROCUREMENT_INVOICE_MATCH,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc(
      "accept_supplier_invoice_discrepancy" as never,
      {
        p_invoice_id: data.invoiceId,
        p_reason: data.reason,
      } as never,
    );
    if (error) {
      return {
        success: false,
        error: "Không thể chấp nhận chênh lệch hóa đơn.",
      };
    }
    return { success: true };
  },
);

export const verifyServiceSupplierInvoice = withAction(
  {
    roles: ROLES,
    schema: verifyServiceInvoiceSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_INVOICE_MATCH,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc(
      "verify_service_supplier_invoice" as never,
      {
        p_invoice_id: data.invoiceId,
        p_reason: data.reason,
      } as never,
    );
    if (error) {
      const message = error.message ?? "";
      if (message.includes("service_invoice_verification_invalid")) {
        return {
          success: false,
          error: "Hóa đơn dịch vụ không còn ở trạng thái chờ xác minh.",
        };
      }
      return {
        success: false,
        error: "Không thể xác minh chứng từ dịch vụ.",
      };
    }
    return { success: true };
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
        error: "File HĐ GTGT không thuộc hệ thống hiện tại.",
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
  return `id, invoice_kind, invoice_number, invoice_date, subtotal, vat_rate, vat_amount, vat_breakdown, vat_invoice_attachment_path, total_amount, matching_status, matching_notes, matching_expected_amount, matching_received_amount, matching_difference_amount, matching_reason_code, service_verified_at, service_verification_reason, document_discount_amount, supplier_id, grn_id, po_id, due_date, payment_status, paid_amount, credit_applied_amount, paid_at, suppliers ( id, name ), purchase_orders ( id, po_number ), supplier_payments ( id, amount, payment_method, payment_date, reference_note ), supplier_payment_allocations ( supplier_payments ( id, amount, payment_method, payment_date, reference_note ) ), supplier_invoice_receipt_allocations ( grn_id, po_id, goods_received_notes ( id, grn_number, status ), purchase_orders ( id, po_number ) ), ${grnSelect}`;
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
  advances: SupplierAdvanceSummary[];
}

export interface SupplierAdvanceSummary {
  paymentId: number;
  supplierId: number;
  paymentDate: string;
  referenceNote: string | null;
  advanceAmount: number;
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
  vatEvidence: z.enum(SUPPLIER_INVOICE_VAT_EVIDENCE_FILTERS).optional(),
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
    vatEvidence,
    viewMode,
    before,
    pageSize,
  } = parsed.data;
  if (
    branchId != null &&
    !(await canAccessBranch(supabase, claims, branchId))
  ) {
    return { success: false, error: "Không có quyền" };
  }
  const monetary = await loadInventoryMonetaryAccess(claims.user_role);
  if (!monetary.purchasePrice || !monetary.client) {
    return { success: false, error: "Không có quyền" };
  }
  const fetched: Array<{
    id: number;
    invoice_date: string;
    [k: string]: unknown;
  }> = [];
  let scanBefore: SupplierInvoiceCursor | null = null;

  while (true) {
    let query = monetary.client
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
    vatEvidence: vatEvidence ?? null,
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
  const { data: paymentRows, error: paymentError } = await monetary.client
    .from("supplier_payments")
    .select(
      "id, supplier_id, amount, payment_date, reference_note, supplier_payment_allocations ( amount )",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("payment_date", { ascending: false });
  if (paymentError) {
    return {
      success: false,
      error: messages.inventory.supplierInvoices.loadFailed,
    };
  }
  const advances: SupplierAdvanceSummary[] = (paymentRows ?? []).flatMap(
    (payment) => {
      const allocated = Array.isArray(payment.supplier_payment_allocations)
        ? payment.supplier_payment_allocations.reduce(
            (sum, allocation) => sum + Number(allocation.amount ?? 0),
            0,
          )
        : 0;
      const advanceAmount = Math.max(
        Number(payment.amount ?? 0) - allocated,
        0,
      );
      return advanceAmount > 0
        ? [
            {
              paymentId: Number(payment.id),
              supplierId: Number(payment.supplier_id),
              paymentDate: String(payment.payment_date),
              referenceNote:
                typeof payment.reference_note === "string"
                  ? payment.reference_note
                  : null,
              advanceAmount,
            },
          ]
        : [];
    },
  );

  return {
    success: true,
    data: {
      items,
      hasMore,
      nextCursor,
      totalCount: filtered.length,
      groups: groupSupplierInvoices(filtered, viewMode, today),
      advances,
    },
  };
}

export async function recomputeInvoiceMatching(
  invoiceId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(invoiceId);
  if (!id.success) return { success: false, error: "Mã hóa đơn không hợp lệ" };
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
