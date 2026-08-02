export type NumericInputOptions = {
  allowNegative?: boolean;
  maxFractionDigits?: number;
};

export type NumericInputParseResult =
  | {
      state: "empty";
      canonical: "";
      display: "";
    }
  | {
      state: "valid";
      canonical: string;
      display: string;
      value: number;
    }
  | {
      state: "incomplete" | "invalid";
      display: string;
    };

function countCharacter(value: string, character: string) {
  return value.split(character).length - 1;
}

function normalizeInteger(value: string) {
  return value.replace(/^0+(?=\d)/, "") || "0";
}

function isGroupedInteger(value: string, separator: "." | ",") {
  const escapedSeparator = separator === "." ? "\\." : separator;
  return new RegExp(`^\\d{1,3}(?:${escapedSeparator}\\d{3})+$`).test(value);
}

function invalid(display: string): NumericInputParseResult {
  return { state: "invalid", display };
}

function incomplete(display: string): NumericInputParseResult {
  return { state: "incomplete", display };
}

function createValidResult({
  sign,
  whole,
  fraction,
}: {
  sign: string;
  whole: string;
  fraction?: string;
}): NumericInputParseResult {
  const normalizedWhole = normalizeInteger(whole);
  const unsigned =
    fraction == null ? normalizedWhole : `${normalizedWhole}.${fraction}`;
  const canonical = sign && unsigned !== "0" ? `${sign}${unsigned}` : unsigned;
  const value = Number(canonical);

  if (
    !Number.isFinite(value) ||
    (fraction == null && !Number.isSafeInteger(value))
  ) {
    return invalid(canonical);
  }

  return {
    state: "valid",
    canonical,
    display:
      fraction == null
        ? canonical
        : `${sign && unsigned !== "0" ? sign : ""}${normalizedWhole},${fraction}`,
    value,
  };
}

function parseIntegerInput(
  unsigned: string,
  sign: string,
): NumericInputParseResult {
  if (unsigned.includes(",")) return invalid(`${sign}${unsigned}`);

  if (!unsigned.includes(".")) {
    return createValidResult({ sign, whole: unsigned });
  }

  if (isGroupedInteger(unsigned, ".")) {
    return createValidResult({
      sign,
      whole: unsigned.replaceAll(".", ""),
    });
  }

  return invalid(`${sign}${unsigned}`);
}

function parseFraction({
  sign,
  whole,
  fraction,
  maxFractionDigits,
}: {
  sign: string;
  whole: string;
  fraction: string;
  maxFractionDigits: number | null;
}): NumericInputParseResult {
  const normalizedWhole = normalizeInteger(whole);
  const display = `${sign}${normalizedWhole},${fraction}`;

  if (fraction.length === 0) return incomplete(display);
  if (maxFractionDigits != null && fraction.length > maxFractionDigits) {
    return invalid(display);
  }

  return createValidResult({ sign, whole, fraction });
}

function parseDecimalInput(
  unsigned: string,
  sign: string,
  maxFractionDigits: number | null,
  acceptUnambiguousDotDecimal: boolean,
): NumericInputParseResult {
  const dotCount = countCharacter(unsigned, ".");
  const commaCount = countCharacter(unsigned, ",");

  if (dotCount === 0 && commaCount === 0) {
    return createValidResult({ sign, whole: unsigned });
  }

  if (
    acceptUnambiguousDotDecimal &&
    dotCount === 1 &&
    commaCount > 0 &&
    unsigned.lastIndexOf(".") > unsigned.lastIndexOf(",")
  ) {
    const [groupedWhole = "", fraction = ""] = unsigned.split(".");
    if (isGroupedInteger(groupedWhole, ",") && /^\d*$/.test(fraction)) {
      return parseFraction({
        sign,
        whole: groupedWhole.replaceAll(",", ""),
        fraction,
        maxFractionDigits,
      });
    }
    return invalid(`${sign}${unsigned}`);
  }

  if (commaCount === 1) {
    const [rawWhole = "", fraction = ""] = unsigned.split(",");
    const whole = rawWhole || "0";
    const normalizedWhole = whole.includes(".")
      ? isGroupedInteger(whole, ".")
        ? whole.replaceAll(".", "")
        : null
      : /^\d+$/.test(whole)
        ? whole
        : null;

    if (normalizedWhole == null || !/^\d*$/.test(fraction)) {
      return invalid(`${sign}${unsigned}`);
    }

    return parseFraction({
      sign,
      whole: normalizedWhole,
      fraction,
      maxFractionDigits,
    });
  }

  if (commaCount > 1 || (dotCount > 0 && commaCount > 0)) {
    return invalid(`${sign}${unsigned}`);
  }

  if (dotCount > 0 && isGroupedInteger(unsigned, ".")) {
    return createValidResult({
      sign,
      whole: unsigned.replaceAll(".", ""),
    });
  }

  if (acceptUnambiguousDotDecimal && dotCount === 1) {
    const [whole = "", fraction = ""] = unsigned.split(".");
    if (/^\d+$/.test(whole) && /^\d*$/.test(fraction)) {
      return parseFraction({ sign, whole, fraction, maxFractionDigits });
    }
  }

  return invalid(`${sign}${unsigned}`);
}

export function formatNumericInputDraft(value: string) {
  return value.replace(".", ",");
}

export function parseVietnameseNumericInput(
  input: string,
  { allowNegative = false, maxFractionDigits }: NumericInputOptions = {},
): NumericInputParseResult {
  const compact = input.trim();
  if (compact.length === 0) {
    return { state: "empty", canonical: "", display: "" };
  }

  const hasNegative = compact.startsWith("-");
  const unsigned = hasNegative ? compact.slice(1) : compact;
  const sign = hasNegative ? "-" : "";

  if (
    (!allowNegative && compact.includes("-")) ||
    (hasNegative && compact.slice(1).includes("-")) ||
    !/^[\d.,]*$/.test(unsigned)
  ) {
    return invalid(compact);
  }

  if (unsigned.length === 0) {
    return incomplete(sign);
  }

  const fractionDigits =
    maxFractionDigits == null
      ? null
      : Math.max(0, Math.trunc(maxFractionDigits));

  if (fractionDigits === 0) {
    return parseIntegerInput(unsigned, sign);
  }

  return parseDecimalInput(unsigned, sign, fractionDigits, false);
}

export function parseVietnameseNumericImport(
  input: string,
  { allowNegative = false, maxFractionDigits }: NumericInputOptions = {},
): NumericInputParseResult {
  const compact = input.trim();
  if (compact.length === 0) {
    return { state: "empty", canonical: "", display: "" };
  }

  const hasNegative = compact.startsWith("-");
  const unsigned = hasNegative ? compact.slice(1) : compact;
  const sign = hasNegative ? "-" : "";

  if (
    (!allowNegative && compact.includes("-")) ||
    (hasNegative && compact.slice(1).includes("-")) ||
    !/^[\d.,]*$/.test(unsigned)
  ) {
    return invalid(compact);
  }

  if (unsigned.length === 0) {
    return incomplete(sign);
  }

  const fractionDigits =
    maxFractionDigits == null
      ? null
      : Math.max(0, Math.trunc(maxFractionDigits));

  if (fractionDigits === 0) {
    return parseIntegerInput(unsigned, sign);
  }

  return parseDecimalInput(unsigned, sign, fractionDigits, true);
}
