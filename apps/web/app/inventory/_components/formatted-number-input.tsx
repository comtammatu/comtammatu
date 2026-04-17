"use client";

import * as React from "react";
import { Input } from "@comtammatu/ui/components/input";

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

function sanitizeNumericInput(
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
  const separatorIndex = hasExplicitDecimalComma
    ? lastComma
    : dotCount <= 1
      ? cleaned.lastIndexOf(".")
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

function formatDisplayValue(raw: string) {
  if (!raw || raw === "-") {
    return raw;
  }

  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [integerPart = "0", fractionPart = ""] = unsigned.split(".");
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${negative ? "-" : ""}${groupedInteger}${fractionPart.length > 0 ? `,${fractionPart}` : unsigned.endsWith(".") ? "," : ""}`;
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
      value={isFocused ? rawValue : formatDisplayValue(rawValue)}
      onChange={(event) => {
        const nextValue = sanitizeNumericInput(event.target.value, {
          allowNegative,
          maxFractionDigits,
        });
        if (!isControlled) {
          setInnerValue(nextValue);
        }
        onValueChange?.(nextValue);
      }}
      onFocus={(event) => {
        setIsFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setIsFocused(false);
        onValueBlur?.(rawValue, event);
        onBlur?.(event);
      }}
    />
  );
});

FormattedNumberInput.displayName = "FormattedNumberInput";
