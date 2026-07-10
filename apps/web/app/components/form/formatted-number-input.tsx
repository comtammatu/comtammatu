"use client";

import * as React from "react";
import { Input } from "@comtammatu/ui/components/input";
import {
  formatDecimal,
  formatNumericInputDraft,
  parseVietnameseNumericInput,
  type NumericInputParseResult,
} from "@comtammatu/shared/format";

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

export function normalizeTypedDecimalPointAlias(value: string) {
  if (value.includes(",")) return value;
  const index = value.lastIndexOf(".");
  return index < 0
    ? value
    : `${value.slice(0, index)},${value.slice(index + 1)}`;
}

function formatDisplayValue(raw: string, maxFractionDigits: number) {
  if (!raw || raw === "-") {
    return raw;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? formatDecimal(value, maxFractionDigits) : raw;
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
    "aria-invalid": ariaInvalid,
    ...props
  },
  ref,
) {
  const [isFocused, setIsFocused] = React.useState(false);
  const [draft, setDraft] = React.useState<NumericInputParseResult | null>(
    null,
  );
  const isControlled = value != null;
  const [innerValue, setInnerValue] = React.useState(defaultValue ?? "");

  React.useEffect(() => {
    if (isControlled) {
      setInnerValue(value ?? "");
    }
  }, [isControlled, value]);

  const rawValue = isControlled ? (value ?? "") : innerValue;
  const draftInvalid =
    draft?.state === "invalid" || draft?.state === "incomplete";
  const displayValue = isFocused
    ? (draft?.display ?? formatNumericInputDraft(rawValue))
    : formatDisplayValue(rawValue, maxFractionDigits);

  return (
    <Input
      {...props}
      ref={ref}
      type="text"
      autoComplete="off"
      spellCheck={false}
      inputMode={inputMode ?? (maxFractionDigits > 0 ? "decimal" : "numeric")}
      value={displayValue}
      aria-invalid={draftInvalid ? true : ariaInvalid}
      onChange={(event) => {
        const nativeEvent = event.nativeEvent as InputEvent;
        const inputValue =
          maxFractionDigits > 0 &&
          nativeEvent.inputType === "insertText" &&
          nativeEvent.data === "."
            ? normalizeTypedDecimalPointAlias(event.target.value)
            : event.target.value;
        const nextDraft = parseVietnameseNumericInput(inputValue, {
          allowNegative,
          maxFractionDigits,
        });
        setDraft(nextDraft);

        if (nextDraft.state === "valid" || nextDraft.state === "empty") {
          if (!isControlled) {
            setInnerValue(nextDraft.canonical);
          }
          onValueChange?.(nextDraft.canonical);
        }
      }}
      onFocus={(event) => {
        setIsFocused(true);
        setDraft(
          parseVietnameseNumericInput(formatNumericInputDraft(rawValue), {
            allowNegative,
            maxFractionDigits,
          }),
        );
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setIsFocused(false);
        const blurValue =
          draft?.state === "valid" || draft?.state === "empty"
            ? draft.canonical
            : rawValue;
        setDraft(null);
        onValueBlur?.(blurValue, event);
        onBlur?.(event);
      }}
    />
  );
});

FormattedNumberInput.displayName = "FormattedNumberInput";
