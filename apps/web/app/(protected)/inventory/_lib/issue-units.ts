import type { IngredientUnitRow } from "@lib/inventory/types";
import {
  getDefaultIngredientUnit,
  getIngredientUnitOptions,
  type InventoryUnitOptionWithFactor,
} from "@lib/inventory/unit-options";

export type IssueUnitOption = InventoryUnitOptionWithFactor;

type IssueUnitFactor = Pick<IssueUnitOption, "toBaseFactor"> | null | undefined;

const ISSUE_QUANTITY_FRACTION_DIGITS = 3;
const ISSUE_INTEGER_EPSILON = 5e-6;

function snapNearIntegerQuantity(value: number): number {
  const integer = Math.round(value);
  return Math.abs(value - integer) <= ISSUE_INTEGER_EPSILON ? integer : value;
}

/**
 * Selectable issue units for an ingredient: every active ingredient_units row,
 * base unit first.
 */
type IngredientWithUnits = { units?: IngredientUnitRow[] };

export function getIssueUnitOptions(
  ingredient: IngredientWithUnits | undefined,
): IssueUnitOption[] {
  return getIngredientUnitOptions(ingredient, { includeToBaseFactor: true });
}

/**
 * Default issue unit for an ingredient: the base unit when present, else the
 * first active unit, else null.
 */
export function getDefaultIssueUnit(
  ingredient: IngredientWithUnits | undefined,
): IssueUnitOption | null {
  return getDefaultIngredientUnit(getIssueUnitOptions(ingredient));
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
  return snapNearIntegerQuantity(quantity * factor);
}

export function getIssueMaxEntryQuantity(
  baseQuantity: number,
  issueUnit: IssueUnitFactor,
): number {
  const quantity = Number(baseQuantity);
  const factor = resolveToBaseFactor(issueUnit);
  if (!Number.isFinite(quantity) || quantity <= 0 || factor <= 0) return 0;
  return snapNearIntegerQuantity(quantity / factor);
}

export function formatIssueMaxEntryQuantity(quantity: number): string {
  const value = Number(quantity);
  if (!Number.isFinite(value) || value <= 0) return "";

  const scale = 10 ** ISSUE_QUANTITY_FRACTION_DIGITS;
  const floored = Math.floor(snapNearIntegerQuantity(value) * scale) / scale;
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
