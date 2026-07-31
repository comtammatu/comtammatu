import { z } from "zod";
import {
  addMoney,
  calculateVatAmount,
  minorUnitsToCanonical,
  parseMoneyToMinorUnits,
  subtractMoney,
} from "@comtammatu/shared/money";

export const EXPENSE_VAT_RATES = [0, 5, 8, 10] as const;
export type ExpenseVatRate = (typeof EXPENSE_VAT_RATES)[number];

const expenseMoneySchema = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/, {
    error: "Số tiền phải có tối đa 2 chữ số thập phân.",
  });

export const expenseVatLineSchema = z.object({
  vatRate: z.preprocess(
    Number,
    z.union([z.literal(0), z.literal(5), z.literal(8), z.literal(10)]),
  ),
  taxableAmount: expenseMoneySchema.refine(
    (value) => {
      try {
        return parseMoneyToMinorUnits(value) > 0n;
      } catch {
        return false;
      }
    },
    { error: "Tiền trước thuế phải lớn hơn 0." },
  ),
  vatAmount: expenseMoneySchema,
});

export function refineExpenseVatBreakdown(
  lines: Array<{ vatRate: number; vatAmount: string }>,
  addIssue: (
    index: number,
    field: "vatRate" | "vatAmount",
    message: string,
  ) => void,
) {
  const rates = new Set<number>();
  for (const [index, line] of lines.entries()) {
    if (rates.has(line.vatRate)) {
      addIssue(index, "vatRate", "Mỗi mức thuế GTGT chỉ được nhập một lần.");
    }
    if (line.vatRate === 0 && parseMoneyToMinorUnits(line.vatAmount) !== 0n) {
      addIssue(index, "vatAmount", "Mức thuế 0% phải có tiền thuế bằng 0.");
    }
    rates.add(line.vatRate);
  }
}

export function toExpenseVatBreakdownPayload(
  lines: Array<{
    vatRate: number;
    taxableAmount: string;
    vatAmount: string;
  }>,
) {
  return lines.map((line) => ({
    vat_rate: line.vatRate,
    taxable_amount: line.taxableAmount,
    vat_amount: line.vatAmount,
  }));
}

export function expenseGrossFromBreakdown(
  lines: Array<{ taxableAmount: string; vatAmount: string }>,
) {
  return addMoney(
    lines.flatMap((line) => [line.taxableAmount, line.vatAmount]),
  );
}

export function resolveExpenseVatAmount(
  taxableAmount: string,
  vatRate: ExpenseVatRate,
  enteredVatAmount: string,
): string {
  return enteredVatAmount
    ? minorUnitsToCanonical(parseMoneyToMinorUnits(enteredVatAmount))
    : calculateVatAmount(taxableAmount, vatRate);
}

function roundHalfUpDivision(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

export function resolveExpenseVatAmountFromGross(
  grossAmount: string,
  vatRate: ExpenseVatRate,
  enteredVatAmount: string,
): string {
  if (enteredVatAmount) {
    return minorUnitsToCanonical(parseMoneyToMinorUnits(enteredVatAmount));
  }

  return minorUnitsToCanonical(
    roundHalfUpDivision(
      parseMoneyToMinorUnits(grossAmount) * BigInt(vatRate),
      BigInt(100 + vatRate),
    ),
  );
}

export function expenseTaxableFromGross(
  grossAmount: string,
  vatAmount: string,
): string {
  return subtractMoney(grossAmount, vatAmount);
}
