export interface FinanceResultInput {
  netRevenueBeforeVat: number;
  ingredientCost: number;
  operatingExpense: number;
  inventoryMovement: number;
  costAvailable: boolean;
  operatingExpenseAvailable: boolean;
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
  operatingExpenseAvailable,
}: FinanceResultInput): FinanceResult {
  const operatingResult = operatingExpenseAvailable
    ? netRevenueBeforeVat - operatingExpense + inventoryMovement
    : null;

  if (!costAvailable) {
    return {
      grossProfit: null,
      grossMargin: null,
      operatingResult,
    };
  }

  const grossProfit = netRevenueBeforeVat - ingredientCost;

  return {
    grossProfit,
    grossMargin:
      netRevenueBeforeVat > 0 ? (grossProfit / netRevenueBeforeVat) * 100 : 0,
    operatingResult,
  };
}
