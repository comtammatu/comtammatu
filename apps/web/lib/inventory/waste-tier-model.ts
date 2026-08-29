import {
  DEFAULT_WASTE_TIER_SETTINGS,
  type WasteTierSettings,
} from "@comtammatu/shared/settings";

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
  settings?: Partial<WasteTierSettings>;
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
  settings,
}: WasteTierPreviewInput): WasteTierPreview {
  const config: WasteTierSettings = {
    ...DEFAULT_WASTE_TIER_SETTINGS,
    ...settings,
  };

  if (!config.tierEnabled) {
    return {
      tier: 0,
      photoRequired: false,
      approvalRequired: false,
    };
  }

  const quantityRatio =
    availableQuantity > 0 ? baseQuantity / availableQuantity : 0;
  const projectedRollingSum =
    rollingSum === null ? null : rollingSum + pendingIngredientValue;

  const photoRequired =
    value >= config.tier1Threshold ||
    (config.qtyRatioThreshold > 0 &&
      quantityRatio >= config.qtyRatioThreshold) ||
    (projectedRollingSum !== null &&
      projectedRollingSum >= config.tier1Threshold) ||
    isAlwaysTier2WasteReason(reasonCode) ||
    (config.enforceReasonRules && isRiskyWasteReason(reasonCode));

  const approvalRequired =
    value >= config.tier2Threshold ||
    isAlwaysTier2WasteReason(reasonCode) ||
    projectedShiftSum >= config.shiftCap ||
    projectedBranchSum > branchCap;

  return {
    tier: approvalRequired ? 2 : photoRequired ? 1 : 0,
    photoRequired,
    approvalRequired,
  };
}

/** Reason-only floor preview. Value/WAC gates stay server-side. */
export function previewWasteLineTierFromReason(
  reasonCode: string,
  settings?: Partial<WasteTierSettings>,
): WasteTierPreview {
  const config: WasteTierSettings = {
    ...DEFAULT_WASTE_TIER_SETTINGS,
    ...settings,
  };

  if (!config.tierEnabled) {
    return { tier: 0, photoRequired: false, approvalRequired: false };
  }

  if (isAlwaysTier2WasteReason(reasonCode)) {
    return { tier: 2, photoRequired: true, approvalRequired: true };
  }
  if (config.enforceReasonRules && isRiskyWasteReason(reasonCode)) {
    return { tier: 1, photoRequired: true, approvalRequired: false };
  }
  return { tier: 0, photoRequired: false, approvalRequired: false };
}
