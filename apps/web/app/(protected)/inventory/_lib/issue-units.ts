import type { IngredientUnitRow } from "./types";

export interface IssueUnitOption {
  unitId: number;
  code: string;
  label: string;
  isBase: boolean;
  toBaseFactor: number;
}

type IssueUnitFactor = Pick<IssueUnitOption, "toBaseFactor"> | null | undefined;

const ISSUE_QUANTITY_FRACTION_DIGITS = 3;

/**
 * Selectable issue units for an ingredient: every active ingredient_units row,
 * base unit first.
 */
type IngredientWithUnits = { units?: IngredientUnitRow[] };

export function getIssueUnitOptions(
  ingredient: IngredientWithUnits | undefined,
): IssueUnitOption[] {
  const units = ingredient?.units ?? [];
  return units
    .filter((u: IngredientUnitRow) => u.is_active && u.unit_code !== "")
    .sort((a, b) => {
      if (a.is_base !== b.is_base) return a.is_base ? -1 : 1;
      return a.sort_order - b.sort_order;
    })
    .map((u) => ({
      unitId: u.unit_id,
      code: u.unit_code,
      label: u.unit_name?.trim() || u.unit_code,
      isBase: u.is_base,
      toBaseFactor: u.to_base_factor,
    }));
}

/**
 * Default issue unit for an ingredient: the base unit when present, else the
 * first active unit, else null.
 */
export function getDefaultIssueUnit(
  ingredient: IngredientWithUnits | undefined,
): IssueUnitOption | null {
  const options = getIssueUnitOptions(ingredient);
  return options.find((o) => o.isBase) ?? options[0] ?? null;
}

function resolveToBaseFactor(issueUnit: IssueUnitFactor): number {
  const factor = Number(issueUnit?.toBaseFactor ?? 1);
  return Number.isFinite(factor) && factor > 0 ? factor : 0;
}

export function getIssueBaseQuantity(
  entryQuantity: number,
  issueUnit: IssueUnitFactor,
): number {
  const quantity = Number(entryQuantity);
  const factor = resolveToBaseFactor(issueUnit);
  if (!Number.isFinite(quantity) || quantity <= 0 || factor <= 0) return 0;
  return quantity * factor;
}

export function getIssueMaxEntryQuantity(
  baseQuantity: number,
  issueUnit: IssueUnitFactor,
): number {
  const quantity = Number(baseQuantity);
  const factor = resolveToBaseFactor(issueUnit);
  if (!Number.isFinite(quantity) || quantity <= 0 || factor <= 0) return 0;
  return quantity / factor;
}

export function formatIssueMaxEntryQuantity(quantity: number): string {
  const value = Number(quantity);
  if (!Number.isFinite(value) || value <= 0) return "";

  const scale = 10 ** ISSUE_QUANTITY_FRACTION_DIGITS;
  const floored = Math.floor(value * scale) / scale;
  return floored > 0
    ? String(Number(floored.toFixed(ISSUE_QUANTITY_FRACTION_DIGITS)))
    : "";
}

export function clampIssueEntryQuantity(
  value: string,
  maxEntryQuantity: number,
): string {
  const quantity = Number(value);
  const maxQuantity = Number(maxEntryQuantity);
  if (
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !Number.isFinite(maxQuantity) ||
    maxQuantity <= 0
  ) {
    return value;
  }
  return quantity > maxQuantity
    ? formatIssueMaxEntryQuantity(maxQuantity)
    : value;
}
