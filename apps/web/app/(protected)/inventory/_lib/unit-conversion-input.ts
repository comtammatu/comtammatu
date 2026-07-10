import { formatDecimal } from "@comtammatu/shared/format";

export type UnitConversionInputDirection = "unit_to_anchor" | "anchor_to_unit";

export const DEFAULT_UNIT_CONVERSION_INPUT_DIRECTION: UnitConversionInputDirection =
  "unit_to_anchor";

const DISPLAY_FRACTION_DIGITS = 6;
const DISPLAY_INTEGER_EPSILON = 5 / 10 ** DISPLAY_FRACTION_DIGITS;

function snapNearInteger(value: number): number {
  const integer = Math.round(value);
  return Math.abs(value - integer) <= DISPLAY_INTEGER_EPSILON ? integer : value;
}

export function formatConversionFactor(value: number): string {
  return Number(
    snapNearInteger(value).toFixed(DISPLAY_FRACTION_DIGITS),
  ).toString();
}

export function formatConversionFactorDisplay(value: number): string {
  return formatDecimal(snapNearInteger(value), DISPLAY_FRACTION_DIGITS);
}

export function preferredConversionInputDirection(
  storedValue: string,
): UnitConversionInputDirection {
  const value = Number(storedValue);
  return Number.isFinite(value) && value > 0 && value < 1
    ? "anchor_to_unit"
    : DEFAULT_UNIT_CONVERSION_INPUT_DIRECTION;
}

export function displayAnchorFactor(
  storedValue: string,
  direction: UnitConversionInputDirection,
): string {
  if (direction !== "anchor_to_unit") return storedValue;
  const value = Number(storedValue);
  if (!Number.isFinite(value) || value <= 0) return "";
  return formatConversionFactor(1 / value);
}

export function toStoredAnchorFactor(
  displayValue: string,
  direction: UnitConversionInputDirection,
): string {
  const trimmed = displayValue.trim();
  if (direction !== "anchor_to_unit") return trimmed;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return trimmed;
  return String(1 / value);
}
