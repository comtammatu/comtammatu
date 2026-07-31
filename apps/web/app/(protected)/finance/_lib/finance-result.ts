export interface FinanceResultInput {
  netRevenueBeforeVat: number;
  ingredientCost: number;
  operatingExpense: number;
  inventoryMovement: number;
  costAvailable: boolean;
  operatingExpenseRecorded: boolean;
}

export interface FinanceResult {
  grossProfit: number | null;
  grossMargin: number | null;
  operatingResult: number | null;
}

export function calculateFinanceResult({
  netRevenueBeforeVat,
  ingredientCost,
  operatingExpense,
  inventoryMovement,
  costAvailable,
  operatingExpenseRecorded,
}: FinanceResultInput): FinanceResult {
  if (!costAvailable) {
    return {
      grossProfit: null,
      grossMargin: null,
      operatingResult: null,
    };
  }

  const grossProfit = netRevenueBeforeVat - ingredientCost;

  return {
    grossProfit,
    grossMargin:
      netRevenueBeforeVat > 0 ? (grossProfit / netRevenueBeforeVat) * 100 : 0,
    operatingResult: operatingExpenseRecorded
      ? grossProfit - operatingExpense - inventoryMovement
      : null,
  };
}
