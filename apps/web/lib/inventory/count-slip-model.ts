export type CountSlipStatus = "submitted" | "needs_changes" | "approved";

export type CountSlipLineViewInput = {
  id: number;
  ingredientId: number;
  ingredientName: string;
  systemQuantity: number;
  countedQuantity: number;
  entryUnitId: number | null;
  entryUnitCode: string | null;
  baseUnitCode: string | null;
  toBaseFactor: number | null;
  entryToBaseFactor?: number | null;
  countedBaseQuantity?: number | null;
  currentLiveQuantity?: number | null;
  recountRequired?: boolean;
  lastRecountRound?: number;
  note: string | null;
};

export type CountSlipLineView = {
  id: number;
  ingredientId: number;
  ingredientName: string;
  /** Book quantity converted into the employee's entry unit when a factor exists (Snapshot). */
  systemQuantity: number;
  systemUnit: string;
  countedQuantity: number;
  countedUnit: string;
  countedBaseQuantity: number | null;
  variance: number | null;
  varianceUnit: string;
  /** Live stock on-hand quantity for manager real-time reference. */
  currentLiveQuantity: number | null;
  recountRequired: boolean;
  lastRecountRound: number;
  note: string | null;
};

export type CountSlipRow = {
  id: number;
  slipNumber: string;
  branchId: number;
  locationId: number;
  branchName: string;
  locationName: string;
  employeeName: string;
  shiftName: string | null;
  countDate: string;
  status: CountSlipStatus;
  note: string | null;
  reviewNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  recountRound: number;
  lastResubmittedRound: number;
  wasteIssueNumber: string | null;
  lines: CountSlipLineView[];
};

function resolveEntryToBaseFactor(
  input: CountSlipLineViewInput,
  countedUnit: string,
  baseUnit: string,
): number | null {
  const sameUnit =
    countedUnit !== "" && baseUnit !== "" && countedUnit === baseUnit;
  if (input.entryUnitId === null || sameUnit) {
    return 1;
  }
  // Prefer snapshotted conversion factor from the count slip line if available
  const snapshotFactor = input.entryToBaseFactor;
  if (snapshotFactor != null && Number.isFinite(snapshotFactor) && snapshotFactor > 0) {
    return snapshotFactor;
  }
  const factor = input.toBaseFactor;
  if (factor === null || !Number.isFinite(factor) || factor <= 0) {
    return null;
  }
  return factor;
}

export function buildCountSlipLineView(
  input: CountSlipLineViewInput,
): CountSlipLineView {
  const baseUnit = input.baseUnitCode ?? input.entryUnitCode ?? "";
  const countedUnit = input.entryUnitCode ?? baseUnit;
  const factor = resolveEntryToBaseFactor(input, countedUnit, baseUnit);
  const liveQty =
    input.currentLiveQuantity != null && Number.isFinite(input.currentLiveQuantity)
      ? (factor !== null && factor > 0 ? input.currentLiveQuantity / factor : input.currentLiveQuantity)
      : null;

  if (factor === null) {
    return {
      id: input.id,
      ingredientId: input.ingredientId,
      ingredientName: input.ingredientName,
      systemQuantity: input.systemQuantity,
      systemUnit: baseUnit,
      countedQuantity: input.countedQuantity,
      countedUnit,
      countedBaseQuantity: input.countedBaseQuantity ?? null,
      variance: null,
      varianceUnit: baseUnit,
      currentLiveQuantity: liveQty,
      recountRequired: input.recountRequired === true,
      lastRecountRound: input.lastRecountRound ?? 0,
      note: input.note,
    };
  }

  const countedBase = input.countedBaseQuantity ?? input.countedQuantity * factor;
  return {
    id: input.id,
    ingredientId: input.ingredientId,
    ingredientName: input.ingredientName,
    systemQuantity: input.systemQuantity / factor,
    systemUnit: countedUnit,
    countedQuantity: input.countedQuantity,
    countedUnit,
    countedBaseQuantity: countedBase,
    variance: input.countedQuantity - input.systemQuantity / factor,
    varianceUnit: countedUnit,
    currentLiveQuantity: liveQty,
    recountRequired: input.recountRequired === true,
    lastRecountRound: input.lastRecountRound ?? 0,
    note: input.note,
  };
}
