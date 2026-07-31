export {
  formatNumericInputDraft,
  parseVietnameseNumericImport,
  parseVietnameseNumericInput,
  type NumericInputOptions,
  type NumericInputParseResult,
} from "./numeric-input";
import {
  canonicalizeMoney,
  minorUnitsToCanonical,
  parseMoneyToMinorUnits,
} from "../money/index";

export type DecimalLike = string | number;

/**
 * Format a number as Vietnamese Dong (VND).
 *
 * Examples:
 *   formatVND(45000)     → "45.000đ"
 *   formatVND(1250000)   → "1.250.000đ"
 *   formatVND(0)         → "0đ"
 *   formatVND(-30000)    → "-30.000đ"
 */
export function formatVND(amount: DecimalLike): string {
  const canonical = toCanonicalMoney(amount);
  if (canonical == null) return "0đ";
  const [whole, fraction] = canonical.split(".");
  const trimmedFraction = fraction?.replace(/0+$/, "");
  return `${formatCanonicalDecimal(
    trimmedFraction ? `${whole}.${trimmedFraction}` : (whole ?? "0"),
  )}đ`;
}

export function formatAccountingVND(amount: DecimalLike): string {
  const canonical = toCanonicalMoney(amount);
  if (canonical == null) return "0,00đ";
  return `${formatCanonicalDecimal(canonical, true)}đ`;
}

export function formatCompactVND(amount: DecimalLike): string {
  const canonical = toCanonicalMoney(amount);
  if (canonical == null) return "0đ";

  const minorUnits = parseMoneyToMinorUnits(canonical);
  const billionMinorUnits = 100_000_000_000n;
  if (minorUnits > -billionMinorUnits && minorUnits < billionMinorUnits) {
    return formatVND(canonical);
  }

  const negative = minorUnits < 0n;
  const absolute = negative ? -minorUnits : minorUnits;
  const scaled = absolute * 100n;
  const rounded = (scaled + billionMinorUnits / 2n) / billionMinorUnits;
  const display = formatCanonicalDecimal(minorUnitsToCanonical(rounded));
  return `${negative ? "-" : ""}${display} tỷ`;
}

function toCanonicalMoney(value: DecimalLike): string | null {
  if (typeof value === "number" && !Number.isFinite(value)) return null;

  try {
    return canonicalizeMoney(value);
  } catch {
    return null;
  }
}

function formatCanonicalDecimal(value: string, fixedFraction = false): string {
  const sign = value.startsWith("-") ? "-" : "";
  const unsigned = sign ? value.slice(1) : value;
  const [whole = "0", fraction] = unsigned.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (fraction == null) return `${sign}${grouped}`;
  const displayFraction = fixedFraction ? fraction.padEnd(2, "0") : fraction;
  return `${sign}${grouped},${displayFraction}`;
}

export function formatDecimalInputValue(
  value: number,
  maximumFractionDigits = 3,
): string {
  if (!Number.isFinite(value)) return "";
  const fractionDigits = Math.max(0, Math.trunc(maximumFractionDigits));
  const fixed = Math.abs(value).toFixed(fractionDigits);
  const [whole = "0", rawFraction] = fixed.split(".");
  const fraction = rawFraction?.replace(/0+$/, "");
  const normalized = fraction ? `${whole}.${fraction}` : whole;
  return value < 0 && normalized !== "0" ? `-${normalized}` : normalized;
}

export function formatDecimal(
  value: number,
  maximumFractionDigits = 3,
): string {
  const raw = formatDecimalInputValue(value, maximumFractionDigits);
  if (!raw) return "0";
  const sign = raw.startsWith("-") ? "-" : "";
  const unsigned = sign ? raw.slice(1) : raw;
  const [whole = "0", fraction] = unsigned.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return fraction ? `${sign}${grouped},${fraction}` : `${sign}${grouped}`;
}

export function formatQuantity(value: number): string {
  return formatDecimal(value, 3);
}

export function formatPercent(
  value: number,
  maximumFractionDigits = 1,
): string {
  if (!Number.isFinite(value)) return "0%";
  return `${formatDecimal(value, maximumFractionDigits)}%`;
}

/**
 * Format an integer count with Vietnamese thousands grouping (".").
 * Uses the same manual grouping as formatVND so it never relies on the
 * vi-VN Intl locale (which the vnd-format-ssot guard forbids spreading).
 *
 * Examples:
 *   formatCount(1234) → "1.234"
 *   formatCount(59)   → "59"
 */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value);
  return formatDecimal(rounded, 0);
}
