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
  invalidMessage?: string;
};

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
    invalidMessage = "Nhập số theo định dạng vi-VN, dùng dấu phẩy cho phần thập phân.",
    inputMode,
    onBlur,
    onFocus,
    "aria-invalid": ariaInvalid,
    ...props
  },
  ref,
) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);
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
  const displayValue = draftInvalid
    ? draft.display
    : isFocused
      ? (draft?.display ?? formatNumericInputDraft(rawValue))
      : formatDisplayValue(rawValue, maxFractionDigits);

  return (
    <Input
      {...props}
      ref={inputRef}
      type="text"
      autoComplete="off"
      spellCheck={false}
      inputMode={inputMode ?? (maxFractionDigits > 0 ? "decimal" : "numeric")}
      value={displayValue}
      aria-invalid={draftInvalid ? true : ariaInvalid}
      onChange={(event) => {
        const nextDraft = parseVietnameseNumericInput(event.target.value, {
          allowNegative,
          maxFractionDigits,
        });
        setDraft(nextDraft);
        event.currentTarget.setCustomValidity(
          nextDraft.state === "invalid" || nextDraft.state === "incomplete"
            ? invalidMessage
            : "",
        );

        if (nextDraft.state === "valid" || nextDraft.state === "empty") {
          if (!isControlled) {
            setInnerValue(nextDraft.canonical);
          }
          onValueChange?.(nextDraft.canonical);
        }
      }}
      onFocus={(event) => {
        setIsFocused(true);
        setDraft((current) =>
          current?.state === "invalid" || current?.state === "incomplete"
            ? current
            : parseVietnameseNumericInput(formatNumericInputDraft(rawValue), {
                allowNegative,
                maxFractionDigits,
              }),
        );
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setIsFocused(false);
        if (draft?.state === "invalid" || draft?.state === "incomplete") {
          event.currentTarget.setCustomValidity(invalidMessage);
          event.currentTarget.reportValidity();
        } else {
          const blurValue =
            draft?.state === "valid" || draft?.state === "empty"
              ? draft.canonical
              : rawValue;
          event.currentTarget.setCustomValidity("");
          setDraft(null);
          onValueBlur?.(blurValue, event);
        }
        onBlur?.(event);
      }}
    />
  );
});

FormattedNumberInput.displayName = "FormattedNumberInput";
