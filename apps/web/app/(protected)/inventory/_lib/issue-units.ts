import type { IngredientUnitRow } from "@lib/inventory/types";
import {
  getIngredientRoleUnit,
  getRoleUnitOptionsWithFactor,
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
 * Selectable issue/transfer/waste entry units: configured issue and receipt
 * roles. Production-only units are excluded.
 */
type IngredientWithUnits = {
  units?: IngredientUnitRow[];
  issue_unit_id?: number | null;
  receipt_unit_id?: number | null;
};

export function getIssueUnitOptions(
  ingredient: IngredientWithUnits | undefined,
): IssueUnitOption[] {
  return getRoleUnitOptionsWithFactor(ingredient, ["issue", "receipt"]);
}

/**
 * Default issue/transfer/waste unit: the configured issue role.
 */
export function getDefaultIssueUnit(
  ingredient: IngredientWithUnits | undefined,
): IssueUnitOption | null {
  const defaultUnit = getIngredientRoleUnit(ingredient, "issue");
  if (!defaultUnit) return getIssueUnitOptions(ingredient)[0] ?? null;
  const factor = ingredient?.units?.find(
    (row) => row.unit_id === defaultUnit.unitId,
  )?.to_base_factor;
  return { ...defaultUnit, toBaseFactor: factor ?? 1 };
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
