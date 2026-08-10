import { z } from "zod";
import {
  canonicalizeMoney,
  hasMaximumScale,
  minorUnitsToCanonical,
  parseMoneyToMinorUnits,
} from "@comtammatu/shared/money";
import { FORM_VI } from "@comtammatu/shared/messages";
import {
  diffVNDateDays,
  formatVNDate,
  getVNDateString,
} from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import {
  calculateSupplierInvoiceGrossLineTotal,
  calculateSupplierInvoiceNetLineTotal,
  type SupplierInvoiceVatMode,
  type SupplierInvoiceVatRate,
} from "../_lib/supplier-invoice-money";
import type { SupplierInvoiceGroup as SupplierInvoiceAggregateGroup } from "./supplier-invoice-list-model";
import {
  getSupplierInvoiceOutstandingAmount,
  type SupplierInvoiceRow,
} from "./supplier-invoice-row";

export type SupplierOption = {
  id: number;
  name: string;
};

export type GrnOption = {
  optionKey: string;
  id: number;
  code: string;
  supplierId: number;
  supplierName: string;
  poId: number | null;
  netAcceptedAmount: number | null;
  lines: Array<{
    grnItemId: number;
    purchaseOrderItemId: number;
    ingredientId: number;
    ingredientName: string;
    unitId: number;
    unitLabel: string;
    availableQuantity: number;
  }>;
};

export type SupplierInvoiceMode =
  | "view"
  | "create"
  | "edit"
  | "pay"
  | "credit"
  | "advance";

export type SupplierInvoiceGroup = SupplierInvoiceAggregateGroup & {
  title: string;
  subtitle: string;
};

export const ALL_FILTER_VALUE = "_all";

const optionalMoneySchema = z.string().refine(
  (value) => {
    if (!value.trim()) return true;
    return (
      /^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(value) &&
      hasMaximumScale(value, 2) &&
      parseMoneyToMinorUnits(value) >= 0n
    );
  },
  { error: messages.inventory.supplierInvoices.invalidAmount },
);

const positiveMoneySchema = optionalMoneySchema.refine(
  (value) => {
    try {
      return !!value && parseMoneyToMinorUnits(value) > 0n;
    } catch {
      return false;
    }
  },
  { error: FORM_VI.required },
);

export function canonicalMoney(value: string | number): string {
  return canonicalizeMoney(value || 0);
}

export function minimumMinorUnits(values: readonly bigint[]): bigint {
  return values.reduce(
    (minimum, value) => (value < minimum ? value : minimum),
    values[0] ?? 0n,
  );
}

export function allocateSupplierMoney(
  requestedAmount: string,
  invoices: readonly SupplierInvoiceRow[],
) {
  let remaining = parseMoneyToMinorUnits(canonicalMoney(requestedAmount));
  return invoices.flatMap((invoice) => {
    if (remaining <= 0n) return [];
    const outstanding = parseMoneyToMinorUnits(
      canonicalMoney(getSupplierInvoiceOutstandingAmount(invoice)),
    );
    const allocated = minimumMinorUnits([remaining, outstanding]);
    remaining -= allocated;
    return allocated > 0n
      ? [{ invoiceId: invoice.id, amount: minorUnitsToCanonical(allocated) }]
      : [];
  });
}

export const supplierInvoiceSchema = z
  .object({
    invoiceKind: z.enum(["goods", "service"]),
    grnId: z.string(),
    supplierId: z.string().min(1, { error: FORM_VI.required }),
    invoiceDate: z.string().min(1, { error: FORM_VI.required }),
    invoiceVatRate: z.preprocess(
      Number,
      z.union([z.literal(0), z.literal(5), z.literal(8), z.literal(10)]),
    ),
    documentDiscount: optionalMoneySchema,
    lines: z
      .array(
        z.object({
          key: z.string(),
          ingredientId: z.number().int().positive().nullable(),
          description: z.string().trim().min(1),
          quantity: z.number().positive(),
          unitId: z.number().int().positive().nullable(),
          unitLabel: z.string(),
          unitPrice: optionalMoneySchema,
          grossLineTotal: optionalMoneySchema,
          lineDiscount: optionalMoneySchema,
          vatRate: z.preprocess(
            Number,
            z.union([z.literal(0), z.literal(5), z.literal(8), z.literal(10)]),
          ),
          vatAmount: optionalMoneySchema,
          vatMode: z.enum(["auto", "manual"]),
          allocations: z.array(
            z.object({
              grnId: z.number().int().positive(),
              poId: z.number().int().positive(),
              purchaseOrderItemId: z.number().int().positive(),
              quantity: z.number().positive(),
            }),
          ),
        }),
      )
      .min(1, FORM_VI.required),
  })
  .superRefine((data, ctx) => {
    if (data.invoiceKind === "goods" && data.grnId === "none") {
      ctx.addIssue({
        code: "custom",
        message: messages.inventory.supplierInvoices.goodsReceiptRequired,
        path: ["grnId"],
      });
    }
    data.lines.forEach((line, index) => {
      if (data.invoiceKind === "goods" && line.allocations.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: "Dòng hàng hóa chưa được phân bổ tới phiếu nhập.",
          path: ["lines", index],
        });
      }
      if (!line.unitPrice) {
        ctx.addIssue({
          code: "custom",
          message: FORM_VI.required,
          path: ["lines", index, "unitPrice"],
        });
      }
      if (!line.vatAmount) {
        ctx.addIssue({
          code: "custom",
          message: FORM_VI.required,
          path: ["lines", index, "vatAmount"],
        });
      }
      const grossLineTotal = line.grossLineTotal
        ? canonicalMoney(line.grossLineTotal)
        : calculateSupplierInvoiceGrossLineTotal(
            calculateSupplierInvoiceNetLineTotal(
              String(line.quantity),
              line.unitPrice,
              line.lineDiscount,
            ),
            line.vatAmount,
          );
      if (
        line.vatAmount &&
        parseMoneyToMinorUnits(canonicalMoney(line.vatAmount)) >
          parseMoneyToMinorUnits(grossLineTotal)
      ) {
        ctx.addIssue({
          code: "custom",
          message: messages.inventory.supplierInvoices.vatExceedsGross,
          path: ["lines", index, "vatAmount"],
        });
      }
    });
  });

export type SupplierInvoiceFormValues = z.infer<typeof supplierInvoiceSchema>;

export const supplierPaymentSchema = z.object({
  amount: positiveMoneySchema,
  paymentMethod: z.enum(["cash", "bank_transfer"]),
  referenceNote: z.string().trim().optional(),
});

export type SupplierPaymentFormValues = z.infer<typeof supplierPaymentSchema>;

export const supplierAdvanceSchema = z.object({
  paymentId: z.string().min(1, { error: FORM_VI.required }),
  amount: positiveMoneySchema,
});

export type SupplierAdvanceFormValues = z.infer<typeof supplierAdvanceSchema>;

export const supplierCreditSchema = z.object({
  creditNumber: z.string().trim().min(1, FORM_VI.required),
  amount: positiveMoneySchema,
  notes: z
    .string()
    .trim()
    .min(5, "Lý do giảm công nợ phải có ít nhất 5 ký tự")
    .max(500),
});

export type SupplierCreditFormValues = z.infer<typeof supplierCreditSchema>;

export function createSupplierInvoiceDefaultValues(
  preselectGrnOptionKey?: string | null,
): SupplierInvoiceFormValues {
  return {
    invoiceKind: "goods",
    grnId: preselectGrnOptionKey ?? "none",
    supplierId: "",
    invoiceDate: getVNDateString(),
    invoiceVatRate: 8,
    documentDiscount: "",
    lines: [],
  };
}

export function editSupplierInvoiceDefaultValues(
  invoice: SupplierInvoiceRow,
  grns: GrnOption[],
): SupplierInvoiceFormValues {
  const selectedGrnKeys = [
    ...new Set(
      invoice.receiptAllocations.flatMap((allocation) => {
        const option = grns.find(
          (candidate) =>
            candidate.id === allocation.grnId &&
            candidate.supplierId === invoice.supplierId,
        );
        return option ? [option.optionKey] : [];
      }),
    ),
  ];
  return {
    invoiceKind: invoice.invoiceKind,
    grnId: selectedGrnKeys.length > 0 ? selectedGrnKeys.join(",") : "none",
    supplierId: String(invoice.supplierId),
    invoiceDate: invoice.invoiceDate ?? getVNDateString(),
    invoiceVatRate: (invoice.invoiceLines[0]?.vatRate ??
      8) as SupplierInvoiceVatRate,
    documentDiscount: canonicalMoney(invoice.documentDiscountAmount),
    lines: invoice.invoiceLines.map((line) => ({
      key:
        line.ingredientId != null && line.unitId != null
          ? `${line.ingredientId}:${line.unitId}`
          : `service:${line.id}`,
      ingredientId: line.ingredientId,
      description: line.description,
      quantity: line.quantity,
      unitId: line.unitId,
      unitLabel: line.unitLabel,
      unitPrice: canonicalMoney(line.unitPrice),
      grossLineTotal: canonicalMoney(line.grossLineTotal),
      lineDiscount: canonicalMoney(line.lineDiscount),
      vatRate: line.vatRate as SupplierInvoiceVatRate,
      vatAmount: canonicalMoney(line.vatAmount),
      vatMode: "manual" as SupplierInvoiceVatMode,
      allocations: line.allocations,
    })),
  };
}

export function createSupplierPaymentDefaultValues(
  invoice?: SupplierInvoiceRow | null,
  outstanding?: string,
): SupplierPaymentFormValues {
  return {
    amount: invoice
      ? (outstanding ??
        canonicalMoney(getSupplierInvoiceOutstandingAmount(invoice)))
      : "",
    paymentMethod: "bank_transfer",
    referenceNote: "",
  };
}

export function formatSupplierInvoiceDate(value: string | null) {
  if (!value) return "Chưa có";
  return formatVNDate(value, "Chưa có");
}

export function getPrimaryInvoice(group: SupplierInvoiceGroup) {
  return group.primaryInvoice;
}

export function isMissingMatchingEvidence(invoice: SupplierInvoiceRow) {
  return (
    invoice.invoiceKind === "goods" && invoice.receiptAllocations.length === 0
  );
}

export function getInvoiceAgingLabel(
  invoice: SupplierInvoiceRow,
  copy: typeof messages.inventory.supplierInvoices,
) {
  if (
    invoice.paymentStatus === "paid" ||
    getSupplierInvoiceOutstandingAmount(invoice) <= 0
  ) {
    return copy.agingPaid;
  }
  if (!invoice.dueDate) return copy.agingNoDueDate;

  const days = diffVNDateDays(invoice.dueDate, getVNDateString());
  if (days > 0) return copy.agingOverdue(days);
  if (days === 0) return copy.agingDueToday;
  return copy.agingDueIn(Math.abs(days));
}

export function getPaymentMethodLabel(
  method: string,
  copy: typeof messages.inventory.supplierInvoices,
) {
  if (method === "cash" || method === "bank_transfer") {
    return copy.paymentMethods[method];
  }
  return method || copy.unknownPaymentMethod;
}
