"use client";

import * as React from "react";
import type { FieldValues } from "react-hook-form";
import { cn } from "@comtammatu/ui";
import { FormattedNumberInput } from "./formatted-number-input";
import { NumberField, type NumberFieldProps } from "./number-field";

type FormattedNumberInputProps = React.ComponentProps<
  typeof FormattedNumberInput
>;

type LockedIntegerInputProps = Omit<
  FormattedNumberInputProps,
  "inputMode" | "maxFractionDigits"
>;

export type MoneyVndInputProps = LockedIntegerInputProps;

export const MoneyVndInput = React.forwardRef<
  HTMLInputElement,
  MoneyVndInputProps
>(function MoneyVndInput(props, ref) {
  return (
    <FormattedNumberInput
      {...props}
      ref={ref}
      inputMode="numeric"
      maxFractionDigits={0}
    />
  );
});
MoneyVndInput.displayName = "MoneyVndInput";

export type QuantityInputProps = Omit<
  FormattedNumberInputProps,
  "inputMode"
> & {
  maxFractionDigits?: number;
};

export const QuantityInput = React.forwardRef<
  HTMLInputElement,
  QuantityInputProps
>(function QuantityInput({ maxFractionDigits = 3, className, ...props }, ref) {
  return (
    <FormattedNumberInput
      {...props}
      ref={ref}
      className={cn("text-right tabular-nums", className)}
      inputMode={maxFractionDigits > 0 ? "decimal" : "numeric"}
      maxFractionDigits={maxFractionDigits}
    />
  );
});
QuantityInput.displayName = "QuantityInput";

export type MoneyVndFieldProps<TFieldValues extends FieldValues> = Omit<
  NumberFieldProps<TFieldValues>,
  "maxFractionDigits"
>;

export function MoneyVndField<TFieldValues extends FieldValues>(
  props: MoneyVndFieldProps<TFieldValues>,
) {
  return <NumberField {...props} maxFractionDigits={0} />;
}

export type QuantityFieldProps<TFieldValues extends FieldValues> = Omit<
  NumberFieldProps<TFieldValues>,
  "maxFractionDigits"
> & {
  maxFractionDigits?: number;
};

export function QuantityField<TFieldValues extends FieldValues>({
  maxFractionDigits = 3,
  ...props
}: QuantityFieldProps<TFieldValues>) {
  return <NumberField {...props} maxFractionDigits={maxFractionDigits} />;
}
