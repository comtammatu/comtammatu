/** Parsers for finance period RPCs that return jsonb. */

export interface FoodCostRecordedRpc {
  valuationActive: boolean;
  ingredientCost: number;
  operatingConsumption: number;
  paidOrderCount: number;
  coveredOrderCount: number;
  coverageComplete: boolean;
}

export interface FinanceInventoryBreakdownRpc {
  locationKind: "branch" | "central_supply" | "central_kitchen";
  siteCount: number;
  openingValue: number;
  closingValue: number;
  change: number;
}

export interface FinanceOperatingCockpitRpc {
  netRevenue: number;
  subtotalRevenue: number;
  discountAmount: number;
  orderCount: number;
  cashRevenue: number;
  vietqrRevenue: number;
  foodCost: FoodCostRecordedRpc;
  goodsIn: number;
  goodsInKind: "inbound_transfer" | "inventory_purchase";
  operatingExpenseTotal: number;
  operatingExpenseRecorded: boolean;
  inventoryOpening: number;
  inventoryClosing: number;
  inventoryReadable: boolean;
  inventoryChange: number;
  inventoryChangeIncluded: boolean;
  inventoryBreakdown: FinanceInventoryBreakdownRpc[];
  valuationActive: boolean;
  exceptions: {
    cashVarianceAbs: number;
    cashVarianceSessions: number;
    cashVarianceSessionId: number | null;
    cashVarianceBranchId: number | null;
    unpaidApCount: number;
    unpaidApAmount: number;
    paymentDesyncCount: number;
    paymentDesyncAmount: number;
    invoiceAttentionCount: number;
    unmatchedBankCount: number;
    unmatchedBankAmount: number;
    missingVietqrCount: number;
    missingVietqrAmount: number;
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  let payload: unknown = value;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload) as unknown;
    } catch {
      return null;
    }
  }
  if (
    payload == null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return null;
  }
  return payload as Record<string, unknown>;
}

function moneyNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function wholeCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }
  return null;
}

function optionalId(value: unknown): number | null {
  if (value == null) return null;
  const count = wholeCount(value);
  return count != null && count > 0 ? count : null;
}

function parseInventoryBreakdown(
  raw: unknown,
): FinanceInventoryBreakdownRpc[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;

  const breakdown: FinanceInventoryBreakdownRpc[] = [];
  for (const entry of raw) {
    const row = asRecord(entry);
    if (!row) return null;
    const locationKind = row.location_kind;
    const siteCount = wholeCount(row.site_count);
    const openingValue = moneyNumber(row.opening_value);
    const closingValue = moneyNumber(row.closing_value);
    const change = moneyNumber(row.change);
    if (
      (locationKind !== "branch" &&
        locationKind !== "central_supply" &&
        locationKind !== "central_kitchen") ||
      siteCount == null ||
      openingValue == null ||
      closingValue == null ||
      change == null
    ) {
      return null;
    }
    breakdown.push({
      locationKind,
      siteCount,
      openingValue,
      closingValue,
      change,
    });
  }
  return breakdown;
}

export function parseFoodCostRecordedRpc(
  raw: unknown,
): FoodCostRecordedRpc | null {
  const row = asRecord(raw);
  if (!row) return null;
  const ingredientCost = moneyNumber(row.ingredient_cost);
  const operatingConsumption = moneyNumber(row.operating_consumption);
  const paidOrderCount = wholeCount(row.paid_order_count);
  const coveredOrderCount = wholeCount(row.covered_order_count);
  if (
    ingredientCost == null ||
    operatingConsumption == null ||
    paidOrderCount == null ||
    coveredOrderCount == null
  ) {
    return null;
  }
  return {
    valuationActive: row.valuation_active === true,
    ingredientCost,
    operatingConsumption,
    paidOrderCount,
    coveredOrderCount,
    coverageComplete:
      row.coverage_complete === true ||
      paidOrderCount === 0 ||
      coveredOrderCount >= paidOrderCount,
  };
}

export function parseFinanceOperatingCockpitRpc(
  raw: unknown,
): FinanceOperatingCockpitRpc | null {
  const row = asRecord(raw);
  if (!row) return null;
  const foodCost = parseFoodCostRecordedRpc(row.food_cost);
  const exceptions = asRecord(row.exceptions);
  if (!foodCost || !exceptions) return null;

  const netRevenue = moneyNumber(row.net_revenue);
  const subtotalRevenue = moneyNumber(row.subtotal_revenue);
  const discountAmount = moneyNumber(row.discount_amount);
  const orderCount = wholeCount(row.order_count);
  const cashRevenue = moneyNumber(row.cash_revenue);
  const vietqrRevenue = moneyNumber(row.vietqr_revenue);
  const goodsIn = moneyNumber(row.goods_in);
  const operatingExpenseTotal = moneyNumber(row.operating_expense_total);
  const inventoryOpening = moneyNumber(row.inventory_opening);
  const inventoryClosing = moneyNumber(row.inventory_closing);
  const inventoryBreakdown = parseInventoryBreakdown(row.inventory_breakdown);
  const inventoryChangeIncluded = row.inventory_change_included !== false;
  // New payloads carry the key and must be read strictly; a pre-migration
  // payload lacks it, so fall back to food_cost.valuation_active, which
  // reproduces the old RPC semantics (branch scope reported the real
  // cutover state there; company scope hard-coded false).
  const valuationActive =
    "valuation_active" in row
      ? row.valuation_active === true
      : foodCost.valuationActive;
  const goodsInKind =
    row.goods_in_kind === "inbound_transfer" ||
    row.goods_in_kind === "inventory_purchase"
      ? row.goods_in_kind
      : null;

  const cashVarianceAbs = moneyNumber(exceptions.cash_variance_abs);
  const cashVarianceSessions = wholeCount(exceptions.cash_variance_sessions);
  const unpaidApCount = wholeCount(exceptions.unpaid_ap_count);
  const unpaidApAmount = moneyNumber(exceptions.unpaid_ap_amount);
  const paymentDesyncCount = wholeCount(exceptions.payment_desync_count);
  const paymentDesyncAmount = moneyNumber(exceptions.payment_desync_amount);
  const invoiceAttentionCount = wholeCount(exceptions.invoice_attention_count);
  const unmatchedBankCount = wholeCount(exceptions.unmatched_bank_count);
  const unmatchedBankAmount = moneyNumber(exceptions.unmatched_bank_amount);
  const missingVietqrCount = wholeCount(exceptions.missing_vietqr_count);
  const missingVietqrAmount = moneyNumber(exceptions.missing_vietqr_amount);

  if (
    netRevenue == null ||
    subtotalRevenue == null ||
    discountAmount == null ||
    orderCount == null ||
    cashRevenue == null ||
    vietqrRevenue == null ||
    goodsIn == null ||
    goodsInKind == null ||
    operatingExpenseTotal == null ||
    inventoryOpening == null ||
    inventoryClosing == null ||
    inventoryBreakdown == null ||
    cashVarianceAbs == null ||
    cashVarianceSessions == null ||
    unpaidApCount == null ||
    unpaidApAmount == null ||
    paymentDesyncCount == null ||
    paymentDesyncAmount == null ||
    invoiceAttentionCount == null ||
    unmatchedBankCount == null ||
    unmatchedBankAmount == null ||
    missingVietqrCount == null ||
    missingVietqrAmount == null
  ) {
    return null;
  }

  // Backwards-compatible fallback: a pre-migration payload lacks the new
  // key, so derive the change identity locally during the deploy window.
  // Opening/closing are proven non-null by the guard above.
  const inventoryChange =
    moneyNumber(row.inventory_change) ?? inventoryClosing - inventoryOpening;

  return {
    netRevenue,
    subtotalRevenue,
    discountAmount,
    orderCount,
    cashRevenue,
    vietqrRevenue,
    foodCost,
    goodsIn,
    goodsInKind,
    operatingExpenseTotal,
    operatingExpenseRecorded: row.operating_expense_recorded === true,
    inventoryOpening,
    inventoryClosing,
    inventoryReadable: row.inventory_readable === true,
    inventoryChange,
    inventoryChangeIncluded,
    inventoryBreakdown,
    valuationActive,
    exceptions: {
      cashVarianceAbs,
      cashVarianceSessions,
      cashVarianceSessionId: optionalId(exceptions.cash_variance_session_id),
      cashVarianceBranchId: optionalId(exceptions.cash_variance_branch_id),
      unpaidApCount,
      unpaidApAmount,
      paymentDesyncCount,
      paymentDesyncAmount,
      invoiceAttentionCount,
      unmatchedBankCount,
      unmatchedBankAmount,
      missingVietqrCount,
      missingVietqrAmount,
    },
  };
}
