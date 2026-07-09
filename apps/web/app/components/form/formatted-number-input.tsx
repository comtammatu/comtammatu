"use client";

import * as React from "react";
import { Input } from "@comtammatu/ui/components/input";
import { formatDecimal } from "@comtammatu/shared/format";

type FormattedNumberInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "type" | "value" | "defaultValue" | "onChange"
> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onValueBlur?: (
    value: string,
    event: React.FocusEvent<HTMLInputElement>,
  ) => void;
  allowNegative?: boolean;
  maxFractionDigits?: number;
};

function looksLikeGroupedInteger(value: string) {
  return /^\d{1,3}(\.\d{3})+$/.test(value);
}

export function sanitizeNumericInput(
  input: string,
  {
    allowNegative = false,
    maxFractionDigits = 2,
  }: {
    allowNegative?: boolean;
    maxFractionDigits?: number;
  },
) {
  const compact = input.replace(/\s+/g, "");
  const negative = allowNegative && compact.includes("-");
  const cleaned = compact.replace(/[^\d.,]/g, "");

  if (cleaned.length === 0) {
    return negative ? "-" : "";
  }

  if (maxFractionDigits <= 0) {
    const integerOnly = cleaned.replace(/[.,]/g, "").replace(/^0+(?=\d)/, "");
    const normalized = integerOnly || "0";
    return `${negative ? "-" : ""}${normalized}`;
  }

  const lastComma = cleaned.lastIndexOf(",");
  const hasExplicitDecimalComma = lastComma >= 0;
  const dotMatches = cleaned.match(/\./g);
  const dotCount = dotMatches ? dotMatches.length : 0;
  const dotIndex = cleaned.lastIndexOf(".");
  const digitsAfterDot =
    dotIndex >= 0 ? cleaned.slice(dotIndex + 1).replace(/[^\d]/g, "") : "";
  const dotCanBeDecimal =
    !hasExplicitDecimalComma &&
    dotCount === 1 &&
    digitsAfterDot.length <= maxFractionDigits &&
    !looksLikeGroupedInteger(cleaned);
  const separatorIndex = hasExplicitDecimalComma
    ? lastComma
    : dotCanBeDecimal
      ? dotIndex
      : -1;
  const hasTrailingSeparator =
    separatorIndex >= 0 && separatorIndex === cleaned.length - 1;

  if (separatorIndex < 0) {
    const integerOnly = cleaned.replace(/[.,]/g, "").replace(/^0+(?=\d)/, "");
    const normalized = integerOnly || "0";
    return `${negative ? "-" : ""}${normalized}`;
  }

  const digitsAfterSeparator = cleaned
    .slice(separatorIndex + 1)
    .replace(/[^\d]/g, "");

  const integerPart = cleaned
    .slice(0, separatorIndex)
    .replace(/[.,]/g, "")
    .replace(/^0+(?=\d)/, "");
  const fractionPart = digitsAfterSeparator.slice(0, maxFractionDigits);
  const normalizedInteger = integerPart || "0";

  return `${negative ? "-" : ""}${normalizedInteger}${hasTrailingSeparator || fractionPart.length > 0 ? `.${fractionPart}` : ""}`;
}

function formatDisplayValue(raw: string, maxFractionDigits: number) {
  if (!raw || raw === "-") {
    return raw;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? formatDecimal(value, maxFractionDigits) : raw;
}

export function resolveFormattedNumberInputDisplay(
  rawValue: string,
  {
    focusedValue,
    isFocused,
    maxFractionDigits,
  }: {
    focusedValue: string | null;
    isFocused: boolean;
    maxFractionDigits: number;
  },
) {
  if (isFocused && maxFractionDigits > 0) {
    return focusedValue ?? rawValue;
  }
  return formatDisplayValue(rawValue, maxFractionDigits);
}

export const FormattedNumberInput = React.forwardRef<
  HTMLInputElement,
  FormattedNumberInputProps
>(function FormattedNumberInput(
  {
    value,
    defaultValue,
    onValueChange,
    onValueBlur,
    allowNegative = false,
    maxFractionDigits = 2,
    inputMode,
    onBlur,
    onFocus,
    ...props
  },
  ref,
) {
  const [isFocused, setIsFocused] = React.useState(false);
  const [focusedValue, setFocusedValue] = React.useState<string | null>(null);
  const isControlled = value != null;
  const [innerValue, setInnerValue] = React.useState(defaultValue ?? "");

  React.useEffect(() => {
    if (isControlled) {
      setInnerValue(value ?? "");
    }
  }, [isControlled, value]);

  const rawValue = isControlled ? (value ?? "") : innerValue;

  return (
    <Input
      {...props}
      ref={ref}
      type="text"
      autoComplete="off"
      spellCheck={false}
      inputMode={inputMode ?? (maxFractionDigits > 0 ? "decimal" : "numeric")}
      value={resolveFormattedNumberInputDisplay(rawValue, {
        focusedValue,
        isFocused,
        maxFractionDigits,
      })}
      onChange={(event) => {
        const nextValue = sanitizeNumericInput(event.target.value, {
          allowNegative,
          maxFractionDigits,
        });
        if (!isControlled) {
          setInnerValue(nextValue);
        }
        if (maxFractionDigits > 0) {
          setFocusedValue(nextValue);
        }
        onValueChange?.(nextValue);
      }}
      onFocus={(event) => {
        setIsFocused(true);
        if (maxFractionDigits > 0) {
          setFocusedValue(rawValue);
        }
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setIsFocused(false);
        const blurValue = focusedValue ?? rawValue;
        setFocusedValue(null);
        onValueBlur?.(blurValue, event);
        onBlur?.(event);
      }}
    />
  );
});

FormattedNumberInput.displayName = "FormattedNumberInput";
