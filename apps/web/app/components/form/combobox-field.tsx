"use client";

import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { useController } from "react-hook-form";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { Combobox } from "./combobox";

export interface ComboboxFieldOption {
  value: string;
  label: string;
  /** Optional secondary text shown below label (e.g. SKU, unit) */
  hint?: string;
  /** Tokens searched in addition to `label` (e.g. sku, category) */
  keywords?: string[];
  disabled?: boolean;
}

export interface ComboboxFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  options: readonly ComboboxFieldOption[];
  description?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  required?: boolean;
  onValueChange?: (value: string) => void;
}

export function ComboboxField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  options,
  description,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  disabled,
  className,
  id,
  required,
  onValueChange,
}: ComboboxFieldProps<TFieldValues>) {
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
    <Field data-invalid={hasError} data-disabled={disabled || undefined}>
      <FieldLabel htmlFor={fieldId}>
        {label}
        {required ? " *" : null}
      </FieldLabel>
      <Combobox
        id={fieldId}
        value={value}
        onValueChange={(nextValue) => {
          field.onChange(nextValue);
          onValueChange?.(nextValue);
        }}
        onBlur={field.onBlur}
        ref={field.ref}
        options={options}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
        emptyMessage={emptyMessage}
        disabled={disabled}
        className={className}
        aria-invalid={hasError}
        aria-describedby={describedBy}
        aria-errormessage={errorId}
        aria-required={required || undefined}
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
