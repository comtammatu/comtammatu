export type CountSlipStatus = "submitted" | "needs_changes" | "approved";

export type CountSlipLineViewInput = {
  id: number;
  ingredientName: string;
  systemQuantity: number;
  countedQuantity: number;
  entryUnitId: number | null;
  entryUnitCode: string | null;
  baseUnitCode: string | null;
  toBaseFactor: number | null;
  note: string | null;
};

export type CountSlipLineView = {
  id: number;
  ingredientName: string;
  /** Book quantity converted into the employee's entry unit when a factor exists. */
  systemQuantity: number;
  systemUnit: string;
  countedQuantity: number;
  countedUnit: string;
  countedBaseQuantity: number | null;
  variance: number | null;
  varianceUnit: string;
  note: string | null;
};

export type CountSlipRow = {
  id: number;
  slipNumber: string;
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
  lines: CountSlipLineView[];
};

function resolveEntryToBaseFactor(
  input: CountSlipLineViewInput,
  countedUnit: string,
  baseUnit: string,
): number | null {
  const sameUnit =
    countedUnit !== "" && baseUnit !== "" && countedUnit === baseUnit;
  const factor =
    input.entryUnitId === null || sameUnit ? 1 : input.toBaseFactor;
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
  if (factor === null) {
    return {
      id: input.id,
      ingredientName: input.ingredientName,
      systemQuantity: input.systemQuantity,
      systemUnit: baseUnit,
      countedQuantity: input.countedQuantity,
      countedUnit,
      countedBaseQuantity: null,
      variance: null,
      varianceUnit: baseUnit,
      note: input.note,
    };
  }

  return {
    id: input.id,
    ingredientName: input.ingredientName,
    systemQuantity: input.systemQuantity / factor,
    systemUnit: countedUnit,
    countedQuantity: input.countedQuantity,
    countedUnit,
    countedBaseQuantity: input.countedQuantity * factor,
    variance: input.countedQuantity - input.systemQuantity / factor,
    varianceUnit: countedUnit,
    note: input.note,
  };
}
