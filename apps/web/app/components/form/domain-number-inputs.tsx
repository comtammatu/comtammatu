"use client";

import * as React from "react";
import type { FieldValues } from "react-hook-form";
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
>(function QuantityInput({ maxFractionDigits = 3, ...props }, ref) {
  return (
    <FormattedNumberInput
      {...props}
      ref={ref}
      inputMode={maxFractionDigits > 0 ? "decimal" : "numeric"}
      maxFractionDigits={maxFractionDigits}
    />
  );
});
QuantityInput.displayName = "QuantityInput";

export type TaxRateBpsInputProps = LockedIntegerInputProps;

export const TaxRateBpsInput = React.forwardRef<
  HTMLInputElement,
  TaxRateBpsInputProps
>(function TaxRateBpsInput(props, ref) {
  return (
    <FormattedNumberInput
      {...props}
      ref={ref}
      inputMode="numeric"
      maxFractionDigits={0}
    />
  );
});
TaxRateBpsInput.displayName = "TaxRateBpsInput";

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

export type TaxRateBpsFieldProps<TFieldValues extends FieldValues> = Omit<
  NumberFieldProps<TFieldValues>,
  "maxFractionDigits"
>;

export function TaxRateBpsField<TFieldValues extends FieldValues>(
  props: TaxRateBpsFieldProps<TFieldValues>,
) {
  return <NumberField {...props} maxFractionDigits={0} />;
}
