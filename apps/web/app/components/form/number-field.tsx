"use client";

import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { useController } from "react-hook-form";
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
  const descriptionId = description ? `${fieldId}-description` : undefined;
  const errorId = fieldState.error ? `${fieldId}-error` : undefined;
  const describedBy =
    [descriptionId, errorId].filter(Boolean).join(" ") || undefined;
  const value =
    typeof field.value === "string"
      ? field.value
      : field.value != null
        ? String(field.value)
        : "";

  return (
    <Field data-invalid={hasError || undefined}>
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
        aria-describedby={describedBy}
        aria-invalid={hasError || undefined}
        aria-required={required || undefined}
        className={className}
      />
      {description ? (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      ) : null}
      {fieldState.error ? (
        <FieldError id={errorId} errors={[fieldState.error]} />
      ) : null}
    </Field>
  );
}
