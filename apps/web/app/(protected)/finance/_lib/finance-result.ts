export interface FinanceResultInput {
  netRevenueBeforeVat: number;
  goodsIn: number;
  ingredientCost: number;
  operatingExpense: number;
  inventoryChange: number;
  /** Coverage-complete flag for UI tone/badge — does not blank GP. */
  costAvailable: boolean;
  operatingExpenseRecorded: boolean;
  /** False when inventory valuation cutover is inactive — blanks GP. */
  costReadable?: boolean;
}

export interface FinanceResult {
  /** Menu-sales identity. Independent of `operatingResult`. */
  grossProfit: number | null;
  grossMargin: number | null;
  inventoryChange: number;
  /** Period identity. Must not be derived from `grossProfit`. */
  operatingResult: number | null;
}

/**
 * Sales identity: net revenue − recorded food cost.
 * Incomplete coverage still shows the recorded portion (`needs_review`).
 * Blank only when cost is not readable (valuation cutover inactive).
 */
export function calculateGrossProfitIdentity({
  netRevenueBeforeVat,
  ingredientCost,
  costReadable = true,
}: Pick<FinanceResultInput, "netRevenueBeforeVat" | "ingredientCost"> & {
  costReadable?: boolean;
}): Pick<FinanceResult, "grossProfit" | "grossMargin"> {
  const grossProfit = costReadable
    ? netRevenueBeforeVat - ingredientCost
    : null;
  const grossMargin =
    grossProfit == null
      ? null
      : netRevenueBeforeVat > 0
        ? (grossProfit / netRevenueBeforeVat) * 100
        : 0;
  return { grossProfit, grossMargin };
}

/**
 * Two independent identities — `grossProfit` is not a parent of period result.
 *
 * - grossProfit = revenue − POS ingredient cost (Giá vốn món).
 * - operatingResult = revenue − goods-in − opex + Δinventory.
 *
 * Mixing them (`grossProfit − opex + ΔInv`) double-counts sold goods with
 * inbound stock that still sits in ΔInv.
 */
export function calculateFinanceResult({
  netRevenueBeforeVat,
  goodsIn,
  ingredientCost,
  operatingExpense,
  inventoryChange,
  costAvailable: _costAvailable,
  operatingExpenseRecorded,
  costReadable = true,
}: FinanceResultInput): FinanceResult {
  const { grossProfit, grossMargin } = calculateGrossProfitIdentity({
    netRevenueBeforeVat,
    ingredientCost,
    costReadable,
  });

  return {
    grossProfit,
    grossMargin,
    inventoryChange,
    operatingResult: operatingExpenseRecorded
      ? netRevenueBeforeVat - goodsIn - operatingExpense + inventoryChange
      : null,
  };
}

/**
 * Branch business-day identity. Opex posted that calendar date may be 0đ
 * without blanking KQKD. Inactive cutover blanks GP, margin, and KQKD.
 */
export function calculateBranchDayFinanceResult({
  netRevenueBeforeVat,
  goodsIn,
  ingredientCost,
  operatingExpense,
  inventoryChange,
  costAvailable: _costAvailable,
  valuationActive,
}: Omit<FinanceResultInput, "operatingExpenseRecorded"> & {
  valuationActive: boolean;
}): FinanceResult {
  const { grossProfit, grossMargin } = calculateGrossProfitIdentity({
    netRevenueBeforeVat,
    ingredientCost,
    costReadable: valuationActive,
  });
  return {
    grossProfit,
    grossMargin,
    inventoryChange,
    operatingResult: valuationActive
      ? netRevenueBeforeVat - goodsIn - operatingExpense + inventoryChange
      : null,
  };
}
