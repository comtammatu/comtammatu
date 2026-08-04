export interface FinanceResultInput {
  netRevenueBeforeVat: number;
  ingredientCost: number;
  operatingExpense: number;
  inventoryChange: number;
  costAvailable: boolean;
  operatingExpenseRecorded: boolean;
}

export interface FinanceResult {
  grossProfit: number | null;
  grossMargin: number | null;
  inventoryChange: number;
  operatingResult: number | null;
}

export function calculateFinanceResult({
  netRevenueBeforeVat,
  ingredientCost,
  operatingExpense,
  inventoryChange,
  costAvailable,
  operatingExpenseRecorded,
}: FinanceResultInput): FinanceResult {
  if (!costAvailable) {
    return {
      grossProfit: null,
      grossMargin: null,
      inventoryChange,
      operatingResult: null,
    };
  }

  const grossProfit = netRevenueBeforeVat - ingredientCost;

  return {
    grossProfit,
    grossMargin:
      netRevenueBeforeVat > 0 ? (grossProfit / netRevenueBeforeVat) * 100 : 0,
    inventoryChange,
    operatingResult: operatingExpenseRecorded
      ? grossProfit - operatingExpense + inventoryChange
      : null,
  };
}
