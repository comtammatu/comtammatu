import { z } from "zod";
import { formatPercent } from "@comtammatu/shared/format";
import {
  hasMaximumScale,
  minorUnitsToCanonical,
  parseMoneyToMinorUnits,
} from "@comtammatu/shared/money";
import { FORM_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
import {
  EXPENSE_CATEGORIES_BY_GROUP,
  EXPENSE_CATEGORY_GROUP,
  EXPENSE_PAYMENT_METHODS,
  isOperatingExpenseCategory,
  isStartupCapitalCategory,
  type ExpenseCategory,
  type ExpensePaymentMethod,
} from "../_lib/expense-categories";
import {
  EXPENSE_VAT_RATES,
  resolveExpenseVatAmount,
  type ExpenseVatRate,
} from "../_lib/expense-vat";
import type { ExpenseRow } from "../expense-actions";

export const copy = messages.finance.expenses;
export const TENANT_LEVEL_BRANCH_VALUE = "__tenant__";

const optionalMoneySchema = z.string().refine(
  (value) => {
    if (!value.trim()) return true;
    return (
      /^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(value) &&
      hasMaximumScale(value, 2) &&
      parseMoneyToMinorUnits(value) >= 0n
    );
  },
  { error: FORM_VI.required },
);

const expenseFormLineSchema = z.object({
  taxableAmount: optionalMoneySchema.refine(
    (value) => !!value && parseMoneyToMinorUnits(value) > 0n,
    { error: FORM_VI.required },
  ),
  vatRate: z.enum(["0", "5", "8", "10"]),
  vatAmount: optionalMoneySchema,
});

export const expenseFormSchema = z
  .object({
    expenseDate: z.string().min(1, { error: "Chọn ngày phát sinh" }),
    branchId: z.string(),
    category: z.string().min(1, { error: "Chọn khoản chi" }),
    paymentMethod: z.string().min(1, { error: "Chọn phương thức thanh toán" }),
    note: z.string().trim().min(5, FORM_VI.required).max(500),
    invoiceAttachmentUrl: z.string().optional(),
    lines: z.array(expenseFormLineSchema).min(1).max(EXPENSE_VAT_RATES.length),
  })
  .superRefine((data, ctx) => {
    const rates = new Set<string>();
    data.lines.forEach((line, index) => {
      if (rates.has(line.vatRate)) {
        ctx.addIssue({
          code: "custom",
          message: "Mỗi mức thuế suất chỉ được nhập một lần.",
          path: ["lines", index, "vatRate"],
        });
      }
      rates.add(line.vatRate);

      if (!line.vatAmount) return;
      const vatAmount = parseMoneyToMinorUnits(line.vatAmount);
      if (vatAmount > parseMoneyToMinorUnits(line.taxableAmount)) {
        ctx.addIssue({
          code: "custom",
          message: "Thuế GTGT không được lớn hơn tiền chưa thuế.",
          path: ["lines", index, "vatAmount"],
        });
      }
      if (line.vatRate === "0" && vatAmount !== 0n) {
        ctx.addIssue({
          code: "custom",
          message: "Thuế suất 0% phải có thuế GTGT bằng 0.",
          path: ["lines", index, "vatAmount"],
        });
      }
    });
  });

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

export function buildExpenseVatBreakdown(values: ExpenseFormValues) {
  return values.lines.flatMap((line) => {
    if (
      !line.taxableAmount ||
      parseMoneyToMinorUnits(line.taxableAmount) <= 0n
    ) {
      return [];
    }
    const taxableAmount = minorUnitsToCanonical(
      parseMoneyToMinorUnits(line.taxableAmount),
    );
    const vatRate = Number(line.vatRate) as ExpenseVatRate;
    const vatAmount = resolveExpenseVatAmount(
      taxableAmount,
      vatRate,
      line.vatAmount.trim(),
    );

    return [{ vatRate, taxableAmount, vatAmount }];
  });
}

export function expenseCategoryGroups(currentCategory: string) {
  const operatingOptions = EXPENSE_CATEGORIES_BY_GROUP.operating.map(
    (value) => ({
      value,
      label: copy.categoryLabels[value],
    }),
  );
  const startupOptions = EXPENSE_CATEGORIES_BY_GROUP.startup.map((value) => ({
    value,
    label: copy.categoryLabels[value],
  }));
  const selectable = new Set<string>([
    ...operatingOptions.map((option) => option.value),
    ...startupOptions.map((option) => option.value),
  ]);
  const extraOptions =
    currentCategory && !selectable.has(currentCategory)
      ? [
          {
            value: currentCategory,
            label:
              (copy.categoryLabels as Record<string, string>)[
                currentCategory
              ] ?? currentCategory,
          },
        ]
      : [];
  return [
    { label: copy.monthLabel, options: operatingOptions },
    { label: copy.startupLabel, options: startupOptions },
    ...(extraOptions.length > 0
      ? [{ label: copy.categoryGroupLabels.other, options: extraOptions }]
      : []),
  ];
}

export function expenseCategoryBucketLabel(category: string): string {
  if (isStartupCapitalCategory(category)) return copy.startupLabel;
  if (isOperatingExpenseCategory(category)) return copy.monthLabel;
  const group = EXPENSE_CATEGORY_GROUP[category as ExpenseCategory];
  if (group === "materials") return copy.categoryGroupLabels.materials;
  if (group === "transfer") return copy.categoryGroupLabels.transfer;
  return copy.categoryGroupLabels.other;
}

export const METHOD_OPTIONS = EXPENSE_PAYMENT_METHODS.map((value) => ({
  value,
  label: copy.paymentMethodLabels[value],
}));

export const VAT_RATE_OPTIONS = EXPENSE_VAT_RATES.map((rate) => ({
  value: String(rate),
  label: formatPercent(rate, 0),
}));

export const EMPTY_EXPENSE_LINE: ExpenseFormValues["lines"][number] = {
  taxableAmount: "",
  vatRate: "0",
  vatAmount: "",
};

export function expenseToFormValues(expense: ExpenseRow): ExpenseFormValues {
  return {
    expenseDate: expense.expense_date,
    branchId:
      expense.branch_id == null
        ? TENANT_LEVEL_BRANCH_VALUE
        : String(expense.branch_id),
    category: expense.category,
    paymentMethod: expensePaymentMethod(expense) as ExpensePaymentMethod,
    note: expense.note ?? "",
    invoiceAttachmentUrl: expense.invoice_attachment_url ?? "",
    lines:
      expense.vat_breakdown.length > 0
        ? expense.vat_breakdown.map((line) => ({
            taxableAmount: minorUnitsToCanonical(
              parseMoneyToMinorUnits(String(line.taxableAmount)),
            ),
            vatRate: String(
              line.vatRate,
            ) as ExpenseFormValues["lines"][number]["vatRate"],
            vatAmount: minorUnitsToCanonical(
              parseMoneyToMinorUnits(String(line.vatAmount)),
            ),
          }))
        : [EMPTY_EXPENSE_LINE],
  };
}

export function expenseDetail(row: ExpenseRow): string {
  return [
    row.vendor_name,
    row.note,
    row.transfer_content
      ? copy.transferInstruction.detail(row.transfer_content)
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function expensePaymentMethod(row: ExpenseRow): string {
  return row.transfer_content ? "transfer" : row.payment_method;
}

export function canDeleteExpense(row: ExpenseRow): boolean {
  return (
    row.category !== "bank_deposit" &&
    row.transfer_content == null &&
    row.matchedEventIds.length === 0
  );
}
