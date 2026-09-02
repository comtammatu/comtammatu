"use server";

import { z } from "zod";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getVNDateString } from "@comtammatu/shared/time";
import {
  addMoney,
  canonicalizeMoney,
  parseMoneyToMinorUnits,
  subtractMoney,
} from "@comtammatu/shared/money";
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
import {
  calculateSupplierInvoiceGrossLineTotal,
  calculateSupplierInvoiceNetLineTotal,
  summarizeSupplierInvoiceMoney,
} from "./_lib/supplier-invoice-money";

const ROLES = MODULE_ACL.finance.allowedRoles;

/* ─── Supplier Invoices (3-way match: PO ↔ GRN ↔ Invoice) ─── */

const invoiceMoneySchema = z
  .string()
  .regex(
    /^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/,
    "Số tiền phải có tối đa 2 chữ số thập phân.",
  );
const positiveInvoiceMoneySchema = invoiceMoneySchema.refine(
  (value) => {
    try {
      return parseMoneyToMinorUnits(value) > 0n;
    } catch {
      return false;
    }
  },
  { error: "Số tiền phải lớn hơn 0." },
);
const invoiceQuantitySchema = z
  .string()
  .regex(
    /^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/,
    "Số lượng phải có tối đa 3 chữ số thập phân.",
  )
  .refine((value) => !/^0(?:\.0+)?$/.test(value), {
    error: "Số lượng phải lớn hơn 0.",
  });
const invoiceVatRateSchema = z.preprocess(
  Number,
  z.union([z.literal(0), z.literal(5), z.literal(8), z.literal(10)]),
);
const moneyEquals = (left: string, right: string) =>
  parseMoneyToMinorUnits(left) === parseMoneyToMinorUnits(right);
const rpcMoneyResultSchema = z
  .union([z.string(), z.number()])
  .transform((value) => canonicalizeMoney(value));

const invoiceSchema = z
  .object({
    invoiceId: z.coerce.number().int().positive().nullable().optional(),
    invoiceKind: z.enum(["goods", "service"]).default("goods"),
    supplierId: z.coerce.number().int().positive(),
    invoiceDate: z.string(),
    matchingNotes: z.string().optional(),
    dueDate: z.string().optional().nullable(),
    documentDiscountAmount: invoiceMoneySchema.optional().default("0.00"),
    lines: z
      .array(
        z.object({
          lineKey: z.string().trim().min(1).max(100),
          ingredientId: z.coerce.number().int().positive().nullable(),
          description: z.string().trim().min(1).max(300),
          quantity: invoiceQuantitySchema,
          unitId: z.coerce.number().int().positive().nullable(),
          unitPrice: invoiceMoneySchema,
          grossLineTotal: invoiceMoneySchema,
          lineDiscount: invoiceMoneySchema.default("0.00"),
          vatRate: invoiceVatRateSchema,
          vatAmount: invoiceMoneySchema,
          lineTotal: invoiceMoneySchema,
          allocations: z
            .array(
              z.object({
                grnId: z.coerce.number().int().positive(),
                poId: z.coerce.number().int().positive(),
                purchaseOrderItemId: z.coerce.number().int().positive(),
                quantity: invoiceQuantitySchema,
              }),
            )
            .max(200),
        }),
      )
      .min(1)
      .max(200),
    idempotencyKey: z.string().uuid(),
  })
  .superRefine((data, ctx) => {
    const receiptCount = data.lines.reduce(
      (sum, line) => sum + line.allocations.length,
      0,
    );
    if (data.invoiceKind === "goods" && receiptCount === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Hóa đơn hàng hóa phải liên kết ít nhất một phiếu nhập.",
        path: ["lines"],
      });
    }
    if (data.invoiceKind === "service" && receiptCount > 0) {
      ctx.addIssue({
        code: "custom",
        message: "Hóa đơn dịch vụ không liên kết phiếu nhập.",
        path: ["lines"],
      });
    }
    for (const [index, line] of data.lines.entries()) {
      if (data.invoiceKind === "goods") {
        if (line.ingredientId == null || line.unitId == null) {
          ctx.addIssue({
            code: "custom",
            message: "Dòng hàng hóa phải có nguyên liệu và đơn vị.",
            path: ["lines", index],
          });
        }
      }
      const expectedNetLineTotal = calculateSupplierInvoiceNetLineTotal(
        line.quantity,
        line.unitPrice,
        line.lineDiscount,
      );
      if (!moneyEquals(line.lineTotal, expectedNetLineTotal)) {
        ctx.addIssue({
          code: "custom",
          message: "Tiền trước thuế GTGT không khớp số lượng và đơn giá.",
          path: ["lines", index, "lineTotal"],
        });
      }
      if (
        !moneyEquals(
          line.grossLineTotal,
          calculateSupplierInvoiceGrossLineTotal(
            line.lineTotal,
            line.vatAmount,
          ),
        )
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Tổng tiền dòng không khớp tiền trước thuế và tiền thuế.",
          path: ["lines", index, "grossLineTotal"],
        });
      }
      if (
        parseMoneyToMinorUnits(line.vatAmount) >
        parseMoneyToMinorUnits(line.grossLineTotal)
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Tiền thuế GTGT không được lớn hơn tổng tiền.",
          path: ["lines", index, "vatAmount"],
        });
      }
      if (
        parseMoneyToMinorUnits(line.lineDiscount) >
        parseMoneyToMinorUnits(
          calculateSupplierInvoiceNetLineTotal(
            line.quantity,
            line.unitPrice,
            "0.00",
          ),
        )
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Chiết khấu dòng không được lớn hơn giá trước chiết khấu.",
          path: ["lines", index, "lineDiscount"],
        });
      }
      if (line.vatRate === 0 && parseMoneyToMinorUnits(line.vatAmount) !== 0n) {
        ctx.addIssue({
          code: "custom",
          message: "Mức thuế 0% phải có tiền thuế bằng 0.",
          path: ["lines", index, "vatAmount"],
        });
      }
    }
  });

const confirmSupplierInvoiceSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  idempotencyKey: z.string().uuid(),
});

const supplierInvoiceValuationSummarySchema = z.object({
  status: z.enum(["not_applicable", "settled", "settled_current_period"]),
  provisionalValue: z.coerce.number().default(0),
  finalNetValue: z.coerce.number().default(0),
  inventoryAdjustment: z.coerce.number().default(0),
  productionInventoryAdjustment: z.coerce.number().default(0),
  foodCostVariance: z.coerce.number().default(0),
  wasteVariance: z.coerce.number().default(0),
  supplierReturnVariance: z.coerce.number().default(0),
  currentPeriodVariance: z.coerce.number().default(0),
  warning: z.boolean().default(false),
});

export type SupplierInvoiceValuationSummary = z.infer<
  typeof supplierInvoiceValuationSummarySchema
>;

const supplierPaymentSchema = z
  .object({
    invoiceId: z.coerce.number().int().positive(),
    supplierId: z.coerce.number().int().positive().optional(),
    allocations: z
      .array(
        z.object({
          invoiceId: z.coerce.number().int().positive(),
          amount: positiveInvoiceMoneySchema,
        }),
      )
      .min(1)
      .max(200)
      .optional(),
    idempotencyKey: z.string().uuid(),
    amount: positiveInvoiceMoneySchema,
    paymentMethod: z.enum(["cash", "bank_transfer"]),
    cashBranchId: z.coerce.number().int().positive().nullable().optional(),
    referenceNote: z.string().trim().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.paymentMethod !== "cash") return;
    if (data.cashBranchId == null || data.cashBranchId <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "Trả tiền mặt phải chọn chi nhánh bán hàng.",
        path: ["cashBranchId"],
      });
    }
  });

const supplierAdvanceSchema = z.object({
  paymentId: z.coerce.number().int().positive(),
  idempotencyKey: z.string().uuid(),
  allocations: z
    .array(
      z.object({
        invoiceId: z.coerce.number().int().positive(),
        amount: positiveInvoiceMoneySchema,
      }),
    )
    .min(1)
    .max(200),
});

const supplierPaymentResultSchema = z.object({
  payment_id: z.coerce.number().int().positive(),
  allocated_amount: rpcMoneyResultSchema,
  advance_amount: rpcMoneyResultSchema,
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
      error: messages.inventory.supplierInvoices.vatAttachmentInvalidPath,
    }),
});

const supplierCreditSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  creditNumber: z.string().trim().min(1).max(100),
  amount: positiveInvoiceMoneySchema,
  notes: z
    .string()
    .trim()
    .min(5, "Lý do giảm công nợ phải có ít nhất 5 ký tự")
    .max(500),
  allocations: z
    .array(
      z.object({
        invoiceId: z.coerce.number().int().positive(),
        amount: positiveInvoiceMoneySchema,
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
    permission: PERMISSION_KEYS.FINANCE_VIEW,
  },
  async (data, { supabase }) => {
    const { subtotal, vatAmount, totalAmount } = summarizeSupplierInvoiceMoney(
      data.lines.map((line) => ({
        grossLineTotal: line.grossLineTotal,
        netLineTotal: line.lineTotal,
        vatAmount: line.vatAmount,
      })),
      data.documentDiscountAmount,
    );
    if (
      parseMoneyToMinorUnits(subtotal) <= 0n ||
      parseMoneyToMinorUnits(data.documentDiscountAmount) >
        parseMoneyToMinorUnits(subtotal) ||
      parseMoneyToMinorUnits(totalAmount) < 0n
    ) {
      return {
        success: false,
        error: "Tổng tiền hóa đơn không hợp lệ.",
      };
    }
    const { data: result, error } = await supabase.rpc(
      "save_supplier_invoice_draft" as never,
      {
        p_invoice_id: data.invoiceId ?? null,
        p_invoice: {
          supplier_id: data.supplierId,
          invoice_kind: data.invoiceKind,
          invoice_number: data.idempotencyKey,
          invoice_date: data.invoiceDate,
          due_date: data.dueDate ?? null,
          document_discount_amount: data.documentDiscountAmount,
          subtotal,
          vat_amount: vatAmount,
          total_amount: totalAmount,
          matching_notes: data.matchingNotes ?? null,
        },
        p_lines: data.lines.map((line) => ({
          line_key: line.lineKey,
          ingredient_id: line.ingredientId,
          description: line.description,
          quantity: line.quantity,
          unit_id: line.unitId,
          unit_price: line.unitPrice,
          gross_line_total: line.grossLineTotal,
          line_discount: line.lineDiscount,
          vat_rate: line.vatRate,
          vat_amount: line.vatAmount,
          line_total: line.lineTotal,
        })),
        p_allocations: data.lines.flatMap((line) =>
          line.allocations.map((allocation) => ({
            line_key: line.lineKey,
            grn_id: allocation.grnId,
            po_id: allocation.poId,
            purchase_order_item_id: allocation.purchaseOrderItemId,
            quantity: allocation.quantity,
          })),
        ),
        p_idempotency_key: data.idempotencyKey,
      } as never,
    );
    if (error) {
      if (error.code === PG_ERR.UNIQUE_VIOLATION) {
        return {
          success: false,
          error: "Không thể lưu chứng từ NCC do xung đột dữ liệu.",
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
      if (
        error.message?.includes("supplier_invoice_receipt_line_mismatch") ||
        error.message?.includes("supplier_invoice_receipt_mismatch")
      ) {
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
      if (
        error.message?.includes("supplier_invoice_over_allocation") ||
        error.message?.includes("supplier_invoice_allocation_overbilled") ||
        error.message?.includes(
          "supplier_invoice_allocation_grn_item_missing",
        ) ||
        error.message?.includes(
          "supplier_invoice_allocation_ingredient_mismatch",
        ) ||
        error.message?.includes("supplier_invoice_allocations_invalid")
      ) {
        return {
          success: false,
          error: "Số lượng lập hóa đơn vượt số lượng thực nhận còn lại.",
        };
      }
      if (error.message?.includes("supplier_invoice_total_mismatch")) {
        return {
          success: false,
          error: "Tổng dòng, chiết khấu, thuế GTGT và tổng hóa đơn không khớp.",
        };
      }
      return { success: false, error: "Không thể tạo hóa đơn NCC." };
    }

    const parsed = z
      .object({
        invoice_id: z.coerce.number().int().positive(),
        document_status: z.literal("draft"),
        matching_status: z.string(),
      })
      .safeParse(result);
    if (!parsed.success) {
      return { success: false, error: "Phản hồi lưu hóa đơn không hợp lệ." };
    }
    return {
      success: true,
      data: {
        id: parsed.data.invoice_id,
        documentStatus: parsed.data.document_status,
        matchingStatus: parsed.data.matching_status,
      },
    };
  },
);

export const confirmSupplierInvoice = withAction(
  {
    roles: ROLES,
    schema: confirmSupplierInvoiceSchema,
    permission: PERMISSION_KEYS.FINANCE_VIEW,
  },
  async ({ invoiceId, idempotencyKey }, { supabase }) => {
    const { data, error } = await supabase.rpc(
      "confirm_supplier_invoice" as never,
      {
        p_invoice_id: invoiceId,
        p_idempotency_key: idempotencyKey,
      } as never,
    );
    if (error) {
      if (error.message.includes("supplier_invoice_not_matched")) {
        return {
          success: false,
          error: "Hóa đơn còn chênh lệch hoặc thiếu phân bổ.",
        };
      }
      if (error.message.includes("service_invoice_not_verified")) {
        return {
          success: false,
          error: "Hóa đơn dịch vụ chưa được xác minh chứng từ.",
        };
      }
      return { success: false, error: "Không thể xác nhận hóa đơn NCC." };
    }
    const parsed = z
      .object({ valuation: supplierInvoiceValuationSummarySchema })
      .safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error: "Phản hồi quyết toán giá hóa đơn không hợp lệ.",
      };
    }
    return { success: true, data: parsed.data };
  },
);

export async function getSupplierInvoiceValuationSummary(
  invoiceId: number,
): Promise<ActionResult<SupplierInvoiceValuationSummary>> {
  const parsedInvoiceId = z.coerce
    .number()
    .int()
    .positive()
    .safeParse(invoiceId);
  if (!parsedInvoiceId.success) {
    return { success: false, error: "Mã hóa đơn không hợp lệ." };
  }
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền." };

  const { data, error } = await ctx.supabase.rpc(
    "get_supplier_invoice_valuation_summary",
    { p_invoice_id: parsedInvoiceId.data },
  );
  if (error) {
    console.error("finance.supplier_invoice.valuation_summary_failed", {
      code: error.code,
    });
    return {
      success: false,
      error: messages.inventory.supplierInvoices.valuation.loadFailed,
    };
  }
  const summary = supplierInvoiceValuationSummarySchema.safeParse(data);
  if (!summary.success) {
    return {
      success: false,
      error: "Dữ liệu quyết toán giá của hóa đơn không hợp lệ.",
    };
  }
  return { success: true, data: summary.data };
}

export const recordSupplierPayment = withAction(
  {
    roles: ROLES,
    schema: supplierPaymentSchema,
    permission: PERMISSION_KEYS.FINANCE_VIEW,
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
        p_branch_id:
          data.paymentMethod === "cash" ? (data.cashBranchId ?? null) : null,
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
      if (message.includes("finance_cash_branch_invalid")) {
        return {
          success: false,
          error: "Trả tiền mặt phải chọn chi nhánh bán hàng.",
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
            messages.inventory.supplierInvoices.paymentBlockedNoVatAttachment,
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
    permission: PERMISSION_KEYS.FINANCE_VIEW,
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
    permission: PERMISSION_KEYS.FINANCE_VIEW,
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
    permission: PERMISSION_KEYS.FINANCE_VIEW,
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
    permission: PERMISSION_KEYS.FINANCE_VIEW,
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
        error: "Tệp HĐ GTGT không thuộc hệ thống hiện tại.",
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
          error: "Tệp HĐ GTGT không hợp lệ.",
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
  return `id, document_status, invoice_kind, invoice_date, subtotal, vat_rate, vat_amount, vat_breakdown, vat_invoice_attachment_path, total_amount, matching_status, matching_notes, matching_expected_amount, matching_received_amount, matching_difference_amount, matching_reason_code, service_verified_at, service_verification_reason, document_discount_amount, supplier_id, grn_id, po_id, due_date, payment_status, paid_amount, credit_applied_amount, paid_at, suppliers ( id, name ), purchase_orders ( id, po_number ), supplier_payments ( id, amount, payment_method, payment_date, reference_note ), supplier_payment_allocations ( supplier_payments ( id, amount, payment_method, payment_date, reference_note ) ), supplier_invoice_lines ( id, ingredient_id, description, quantity, unit_id, unit_price, gross_line_total, line_discount_amount, vat_rate, vat_amount, line_total, ingredients ( name ), units ( name, code ), supplier_invoice_receipt_allocations ( grn_id, po_id, purchase_order_item_id, billed_quantity ) ), supplier_invoice_receipt_allocations ( grn_id, po_id, goods_received_notes ( id, grn_number, status ), purchase_orders ( id, po_number ) ), ${grnSelect}`;
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
  totalCount: number;
  groups: SupplierInvoiceGroup[];
  advances: SupplierAdvanceSummary[];
}

export interface SupplierAdvanceSummary {
  paymentId: number;
  supplierId: number;
  paymentDate: string;
  referenceNote: string | null;
  advanceAmount: string;
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
 * Keyset-paginated supplier-invoice list (invoice_date desc, id desc tiebreaker).
 * PostgREST filters run before limit; query/overdue/vatEvidence stay client-side.
 * groups/totalCount use the same SQL filters — groups are built from the current page only.
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
    PERMISSION_KEYS.FINANCE_VIEW,
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

  let listQuery = monetary.client
    .from("supplier_invoices")
    .select(supplierInvoiceSelect(branchId))
    .eq("tenant_id", claims.tenant_id);

  if (branchId != null) {
    listQuery = listQuery.eq("goods_received_notes.branch_id", branchId);
  }
  if (invoiceId != null) {
    listQuery = listQuery.eq("id", invoiceId);
  }
  if (supplierId != null) {
    listQuery = listQuery.eq("supplier_id", supplierId);
  }
  if (paymentStatus != null) {
    listQuery = listQuery.eq("payment_status", paymentStatus);
  }
  if (matchStatus === "pending") {
    listQuery = listQuery.or(
      "matching_status.eq.pending,and(matching_status.eq.matched,grn_id.is.null)",
    );
  } else if (matchStatus === "matched") {
    listQuery = listQuery
      .eq("matching_status", "matched")
      .not("grn_id", "is", null);
  } else if (matchStatus != null) {
    listQuery = listQuery.eq("matching_status", matchStatus);
  }

  if (before) {
    listQuery = listQuery.or(
      `invoice_date.lt.${before.invoiceDate},and(invoice_date.eq.${before.invoiceDate},id.lt.${String(before.id)})`,
    );
  }

  const { data, error } = await listQuery
    .order("invoice_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (error) {
    return {
      success: false,
      error: messages.inventory.supplierInvoices.loadFailed,
    };
  }

  const fetched = (data ?? []) as unknown as Array<{
    id: number;
    invoice_date: string;
    supplier_id: number;
    [k: string]: unknown;
  }>;
  const sqlHasMore = fetched.length > pageSize;
  const sqlRows = sqlHasMore ? fetched.slice(0, pageSize) : fetched;

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
  const mapped = sqlRows.map(mapSupplierInvoiceRow);
  const visibleRows =
    invoiceId != null ? mapped : filterSupplierInvoices(mapped, filters, today);

  const rawById = new Map(sqlRows.map((row) => [row.id, row]));
  const items = visibleRows.flatMap((row) => {
    const raw = rawById.get(row.id);
    return raw ? [raw] : [];
  });
  const lastSqlRow = sqlRows.at(-1);
  const nextCursor =
    sqlHasMore && lastSqlRow?.invoice_date != null
      ? { invoiceDate: lastSqlRow.invoice_date, id: lastSqlRow.id }
      : null;

  let totalCount = visibleRows.length;
  const hasClientOnlyFilters =
    queryText.length > 0 || overdueOnly || vatEvidence != null;
  if (invoiceId == null && !hasClientOnlyFilters) {
    let countQuery = monetary.client
      .from("supplier_invoices")
      .select(
        branchId != null
          ? "id, goods_received_notes!inner ( branch_id )"
          : "id",
        { count: "exact", head: true },
      )
      .eq("tenant_id", claims.tenant_id);

    if (branchId != null) {
      countQuery = countQuery.eq("goods_received_notes.branch_id", branchId);
    }
    if (supplierId != null) {
      countQuery = countQuery.eq("supplier_id", supplierId);
    }
    if (paymentStatus != null) {
      countQuery = countQuery.eq("payment_status", paymentStatus);
    }
    if (matchStatus === "pending") {
      countQuery = countQuery.or(
        "matching_status.eq.pending,and(matching_status.eq.matched,grn_id.is.null)",
      );
    } else if (matchStatus === "matched") {
      countQuery = countQuery
        .eq("matching_status", "matched")
        .not("grn_id", "is", null);
    } else if (matchStatus != null) {
      countQuery = countQuery.eq("matching_status", matchStatus);
    }

    const { count, error: countError } = await countQuery;
    if (countError) {
      return {
        success: false,
        error: messages.inventory.supplierInvoices.loadFailed,
      };
    }
    totalCount = count ?? visibleRows.length;
  }

  const supplierIds = Array.from(
    new Set(
      visibleRows
        .map((row) => row.supplierId)
        .filter((id): id is number => typeof id === "number"),
    ),
  );

  let advances: SupplierAdvanceSummary[] = [];
  if (supplierIds.length > 0) {
    const { data: paymentRows, error: paymentError } = await monetary.client
      .from("supplier_payments")
      .select(
        "id, supplier_id, amount, payment_date, reference_note, supplier_payment_allocations ( amount )",
      )
      .eq("tenant_id", claims.tenant_id)
      .in("supplier_id", supplierIds)
      .order("payment_date", { ascending: false });
    if (paymentError) {
      return {
        success: false,
        error: messages.inventory.supplierInvoices.loadFailed,
      };
    }
    advances = (paymentRows ?? []).flatMap((payment) => {
      const allocated = Array.isArray(payment.supplier_payment_allocations)
        ? addMoney(
            payment.supplier_payment_allocations.map((allocation) =>
              canonicalizeMoney(allocation.amount ?? 0),
            ),
          )
        : "0.00";
      const paymentAmount = canonicalizeMoney(payment.amount ?? 0);
      const rawAdvanceAmount = subtractMoney(paymentAmount, allocated);
      const advanceAmount =
        parseMoneyToMinorUnits(rawAdvanceAmount) > 0n
          ? rawAdvanceAmount
          : "0.00";
      return parseMoneyToMinorUnits(advanceAmount) > 0n
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
    });
  }

  // Page-scoped: "Theo NCC" grouping reflects only rows on this page/keyset slice.
  const groups = groupSupplierInvoices(visibleRows, viewMode, today);

  return {
    success: true,
    data: {
      items,
      hasMore: sqlHasMore,
      nextCursor,
      totalCount,
      groups,
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
    PERMISSION_KEYS.FINANCE_VIEW,
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
