export const BRANCH_STOCK_REPORT_HIGHLIGHT_LIMIT = 8;

export type BranchStockVarianceFlag = "warning" | "critical";

export type BranchStockVarianceSource = {
  ingredient_id: number;
  ingredient_name: string;
  unit: string;
  theoretical: number;
  actual: number;
  variance: number;
  variance_pct: number;
  flag: string;
};

export type BranchStockVariance = {
  ingredientId: number;
  ingredientName: string;
  unit: string;
  theoretical: number;
  actual: number;
  variance: number;
  variancePct: number;
  flag: BranchStockVarianceFlag;
};

export type BranchStockMovementSource = {
  ingredient_id: number;
  ingredient_name: string;
  unit: string;
  opening: number;
  grn_receipt: number;
  transfer_in: number;
  transfer_out: number;
  consumption: number;
  production_consumption: number;
  production_output: number;
  adjustment: number;
  closing: number;
};

export type BranchStockMovement = {
  ingredientId: number;
  ingredientName: string;
  unit: string;
  opening: number;
  grnReceipt: number;
  transferIn: number;
  transferOut: number;
  consumption: number;
  productionConsumption: number;
  productionOutput: number;
  adjustment: number;
  closing: number;
};

function toFiniteNumber(value: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isBranchStockVarianceFlag(
  value: string,
): value is BranchStockVarianceFlag {
  return value === "warning" || value === "critical";
}

function variancePriority(flag: BranchStockVarianceFlag) {
  return flag === "critical" ? 0 : 1;
}

export function toBranchStockVariance(
  row: BranchStockVarianceSource,
): BranchStockVariance | null {
  if (!isBranchStockVarianceFlag(row.flag)) return null;

  return {
    ingredientId: row.ingredient_id,
    ingredientName: row.ingredient_name,
    unit: row.unit,
    theoretical: toFiniteNumber(row.theoretical),
    actual: toFiniteNumber(row.actual),
    variance: toFiniteNumber(row.variance),
    variancePct: toFiniteNumber(row.variance_pct),
    flag: row.flag,
  };
}

export function toBranchStockMovement(
  row: BranchStockMovementSource,
): BranchStockMovement {
  return {
    ingredientId: row.ingredient_id,
    ingredientName: row.ingredient_name,
    unit: row.unit,
    opening: toFiniteNumber(row.opening),
    grnReceipt: toFiniteNumber(row.grn_receipt),
    transferIn: toFiniteNumber(row.transfer_in),
    transferOut: toFiniteNumber(row.transfer_out),
    consumption: toFiniteNumber(row.consumption),
    productionConsumption: toFiniteNumber(row.production_consumption),
    productionOutput: toFiniteNumber(row.production_output),
    adjustment: toFiniteNumber(row.adjustment),
    closing: toFiniteNumber(row.closing),
  };
}

export function getBranchStockVarianceExceptions(
  rows: BranchStockVarianceSource[],
) {
  return rows
    .map(toBranchStockVariance)
    .filter((row): row is BranchStockVariance => row !== null)
    .sort((left, right) => {
      const priority =
        variancePriority(left.flag) - variancePriority(right.flag);
      if (priority !== 0) return priority;

      const variance = Math.abs(right.variancePct) - Math.abs(left.variancePct);
      if (variance !== 0) return variance;

      return left.ingredientName.localeCompare(right.ingredientName, "vi");
    });
}

export function getBranchStockMovementActivityScore(
  movement: BranchStockMovement,
) {
  return [
    movement.grnReceipt,
    movement.transferIn,
    movement.transferOut,
    movement.consumption,
    movement.productionConsumption,
    movement.productionOutput,
    movement.adjustment,
  ].reduce((total, value) => total + Math.abs(value), 0);
}

export function hasBranchStockMovementActivity(movement: BranchStockMovement) {
  return getBranchStockMovementActivityScore(movement) > 0;
}

export function getBranchStockMovementHighlights(
  rows: BranchStockMovementSource[],
  limit = BRANCH_STOCK_REPORT_HIGHLIGHT_LIMIT,
) {
  return rows
    .map(toBranchStockMovement)
    .filter(hasBranchStockMovementActivity)
    .sort((left, right) => {
      const score =
        getBranchStockMovementActivityScore(right) -
        getBranchStockMovementActivityScore(left);
      if (score !== 0) return score;

      return left.ingredientName.localeCompare(right.ingredientName, "vi");
    })
    .slice(0, Math.max(0, Math.floor(limit)));
}
