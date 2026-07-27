import { z } from "zod";

export const EXPENSE_VAT_RATES = [0, 5, 8, 10] as const;

export const expenseVatLineSchema = z.object({
  vatRate: z.coerce.number().refine((value) => [0, 5, 8, 10].includes(value), {
    error: "Thuế GTGT không hợp lệ.",
  }),
  taxableAmount: z.coerce.number().positive(),
  vatAmount: z.coerce.number().min(0),
});

export function refineExpenseVatBreakdown(
  lines: Array<{ vatRate: number; vatAmount: number }>,
  addIssue: (index: number, field: "vatRate" | "vatAmount", message: string) => void,
) {
  const rates = new Set<number>();
  for (const [index, line] of lines.entries()) {
    if (rates.has(line.vatRate)) {
      addIssue(index, "vatRate", "Mỗi mức thuế GTGT chỉ được nhập một lần.");
    }
    if (line.vatRate === 0 && line.vatAmount !== 0) {
      addIssue(index, "vatAmount", "Mức thuế 0% phải có tiền thuế bằng 0.");
    }
    rates.add(line.vatRate);
  }
}

export function toExpenseVatBreakdownPayload(
  lines: Array<{
    vatRate: number;
    taxableAmount: number;
    vatAmount: number;
  }>,
) {
  return lines.map((line) => ({
    vat_rate: line.vatRate,
    taxable_amount: line.taxableAmount,
    vat_amount: line.vatAmount,
  }));
}

export function expenseGrossFromBreakdown(
  lines: Array<{ taxableAmount: number; vatAmount: number }>,
) {
  return lines.reduce(
    (sum, line) => sum + line.taxableAmount + line.vatAmount,
    0,
  );
}
