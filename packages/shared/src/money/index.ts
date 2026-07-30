const CANONICAL_DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

function parseScaledInteger(value: string, scale: number): bigint {
  if (!hasMaximumScale(value, scale)) {
    throw new RangeError(`Expected a canonical decimal with at most ${scale} fraction digits`);
  }

  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const scaled = BigInt(whole) * 10n ** BigInt(scale);
  const fractionUnits = BigInt(fraction.padEnd(scale, "0") || "0");
  const result = scaled + fractionUnits;

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
  if (!Number.isInteger(scale) || scale < 0 || !CANONICAL_DECIMAL_PATTERN.test(value)) {
    return false;
  }

  const fraction = value.split(".")[1];
  return fraction == null || fraction.length <= scale;
}

export function parseMoneyToMinorUnits(value: string): bigint {
  return parseScaledInteger(value, 2);
}

export function minorUnitsToCanonical(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
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

export function multiplyUnitPrice(
  quantity: string,
  unitPrice: string,
): string {
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
