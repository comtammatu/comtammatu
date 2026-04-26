"use client";

import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { useController } from "react-hook-form";
import { cn } from "@comtammatu/ui";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { FormattedNumberInput } from "./formatted-number-input";

export interface NumberFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  description?: string;
  placeholder?: string;
  maxFractionDigits?: number;
  allowNegative?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  required?: boolean;
  autoFocus?: boolean;
}

export function NumberField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder,
  maxFractionDigits,
  allowNegative,
  disabled,
  className,
  id,
  required,
  autoFocus,
}: NumberFieldProps<TFieldValues>) {
  const { field, fieldState } = useController({ control, name });
  const fieldId = id ?? `field-${String(name)}`;
  const hasError = !!fieldState.error;
  const value =
    typeof field.value === "string"
      ? field.value
      : field.value != null
        ? String(field.value)
        : "";

  return (
    <Field data-invalid={hasError}>
      <FieldLabel htmlFor={fieldId}>
        {label}
        {required ? " *" : null}
      </FieldLabel>
      <FormattedNumberInput
        id={fieldId}
        name={field.name}
        value={value}
        onValueChange={field.onChange}
        onBlur={field.onBlur}
        ref={field.ref}
        maxFractionDigits={maxFractionDigits}
        allowNegative={allowNegative}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-invalid={hasError}
        className={cn("h-10", className)}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {fieldState.error ? <FieldError errors={[fieldState.error]} /> : null}
    </Field>
  );
}
