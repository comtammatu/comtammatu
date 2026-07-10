export const WASTE_ALWAYS_TIER_2_REASONS = [
  "found_missing",
  "theft_suspected",
] as const;

export const WASTE_RISKY_REASONS = [
  "dropped",
  "quality_fail",
  "contaminated",
  "found_missing",
  "theft_suspected",
] as const;

const TIER_1_VALUE = 150_000;
const TIER_2_VALUE = 500_000;
const SHIFT_CAP = 1_500_000;

export type WasteTierPreviewInput = {
  value: number;
  baseQuantity: number;
  availableQuantity: number;
  reasonCode: string;
  projectedShiftSum: number;
  projectedBranchSum: number;
  branchCap: number;
  rollingSum: number | null;
  pendingIngredientValue: number;
};

export type WasteTierPreview = {
  tier: 0 | 1 | 2;
  photoRequired: boolean;
  approvalRequired: boolean;
};

export function isAlwaysTier2WasteReason(code: string): boolean {
  return (WASTE_ALWAYS_TIER_2_REASONS as ReadonlyArray<string>).includes(code);
}

export function isRiskyWasteReason(code: string): boolean {
  return (WASTE_RISKY_REASONS as ReadonlyArray<string>).includes(code);
}

export function previewWasteTier({
  value,
  baseQuantity,
  availableQuantity,
  reasonCode,
  projectedShiftSum,
  projectedBranchSum,
  branchCap,
  rollingSum,
  pendingIngredientValue,
}: WasteTierPreviewInput): WasteTierPreview {
  const quantityRatio =
    availableQuantity > 0 ? baseQuantity / availableQuantity : 0;
  const projectedRollingSum =
    rollingSum === null ? null : rollingSum + pendingIngredientValue;
  const photoRequired =
    value >= TIER_1_VALUE ||
    quantityRatio >= 0.5 ||
    (projectedRollingSum !== null && projectedRollingSum >= TIER_1_VALUE) ||
    isRiskyWasteReason(reasonCode);
  const approvalRequired =
    value >= TIER_2_VALUE ||
    isAlwaysTier2WasteReason(reasonCode) ||
    projectedShiftSum >= SHIFT_CAP ||
    projectedBranchSum > branchCap;

  return {
    tier: approvalRequired ? 2 : photoRequired ? 1 : 0,
    photoRequired,
    approvalRequired,
  };
}
