const CANONICAL_DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

function assertCanonicalDecimal(value: string, scale: number): void {
  if (
    !Number.isInteger(scale) ||
    scale < 0 ||
    !CANONICAL_DECIMAL_PATTERN.test(value)
  ) {
    throw new RangeError(
      `Expected a canonical decimal with at most ${scale} fraction digits`,
    );
  }
}

function parseScaledInteger(value: string, scale: number): bigint {
  if (!hasMaximumScale(value, scale)) {
    throw new RangeError(
      `Expected a canonical decimal with at most ${scale} fraction digits`,
    );
  }

  return roundScaledInteger(value, scale);
}

function roundScaledInteger(value: string, scale: number): bigint {
  assertCanonicalDecimal(value, scale);

  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const kept = fraction.slice(0, scale);
  const roundDigit = fraction[scale];
  let result =
    BigInt(whole) * 10n ** BigInt(scale) +
    BigInt(kept.padEnd(scale, "0") || "0");
  if (roundDigit != null && roundDigit >= "5") {
    result += 1n;
  }

  return negative && result !== 0n ? -result : result;
}

function roundHalfUpDivision(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new RangeError("Denominator must be positive");
  }

  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;

  return negative && rounded !== 0n ? -rounded : rounded;
}

export function hasMaximumScale(value: string, scale: number): boolean {
  if (
    !Number.isInteger(scale) ||
    scale < 0 ||
    !CANONICAL_DECIMAL_PATTERN.test(value)
  ) {
    return false;
  }

  const fraction = value.split(".")[1];
  return fraction == null || fraction.length <= scale;
}

export function parseMoneyToMinorUnits(value: string): bigint {
  return parseScaledInteger(value, 2);
}

export function canonicalizeMoney(value: string | number): string {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new RangeError("Expected a finite money value");
  }

  return minorUnitsToCanonical(
    parseMoneyToMinorUnits(
      typeof value === "number" ? numberToDecimal(value) : value,
    ),
  );
}

/** Half-up to 2 decimals. Use at Number / higher-scale valuation boundaries. */
export function roundToCanonicalMoney(value: string | number): string {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new RangeError("Expected a finite money value");
  }

  return minorUnitsToCanonical(
    roundScaledInteger(
      typeof value === "number" ? numberToDecimal(value) : value,
      2,
    ),
  );
}

export function minorUnitsToCanonical(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function numberToDecimal(value: number): string {
  const raw = String(value);
  const match = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(raw);
  if (!match) return raw;

  const sign = match[1] ?? "";
  const whole = match[2] ?? "";
  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? "");
  const digits = `${whole}${fraction}`;
  const decimalIndex = whole.length + exponent;
  if (decimalIndex <= 0) {
    return `${sign}0.${"0".repeat(-decimalIndex)}${digits}`;
  }
  if (decimalIndex >= digits.length) {
    return `${sign}${digits}${"0".repeat(decimalIndex - digits.length)}`;
  }
  return `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}

export function addMoney(values: readonly string[]): string {
  const total = values.reduce(
    (sum, value) => sum + parseMoneyToMinorUnits(value),
    0n,
  );
  return minorUnitsToCanonical(total);
}

export function subtractMoney(left: string, right: string): string {
  return minorUnitsToCanonical(
    parseMoneyToMinorUnits(left) - parseMoneyToMinorUnits(right),
  );
}

export function multiplyUnitPrice(quantity: string, unitPrice: string): string {
  const quantityMilliunits = parseScaledInteger(quantity, 3);
  const unitPriceMinorUnits = parseMoneyToMinorUnits(unitPrice);
  return minorUnitsToCanonical(
    roundHalfUpDivision(quantityMilliunits * unitPriceMinorUnits, 1000n),
  );
}

export function calculateVatAmount(
  taxableAmount: string,
  vatRate: 0 | 5 | 8 | 10,
): string {
  return minorUnitsToCanonical(
    roundHalfUpDivision(
      parseMoneyToMinorUnits(taxableAmount) * BigInt(vatRate),
      100n,
    ),
  );
}
