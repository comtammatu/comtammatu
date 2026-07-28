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

export function buildCountSlipLineView(
  input: CountSlipLineViewInput,
): CountSlipLineView {
  const systemUnit = input.baseUnitCode ?? input.entryUnitCode ?? "";
  const countedUnit = input.entryUnitCode ?? systemUnit;
  const sameUnit =
    systemUnit !== "" && countedUnit !== "" && systemUnit === countedUnit;
  const factor =
    input.entryUnitId === null || sameUnit ? 1 : input.toBaseFactor;
  const countedBaseQuantity =
    factor === null || !Number.isFinite(factor)
      ? null
      : input.countedQuantity * factor;

  return {
    id: input.id,
    ingredientName: input.ingredientName,
    systemQuantity: input.systemQuantity,
    systemUnit,
    countedQuantity: input.countedQuantity,
    countedUnit,
    countedBaseQuantity,
    variance:
      countedBaseQuantity === null
        ? null
        : countedBaseQuantity - input.systemQuantity,
    varianceUnit: systemUnit,
    note: input.note,
  };
}
