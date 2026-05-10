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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";

export interface SelectFieldOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  options: readonly SelectFieldOption[];
  description?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  required?: boolean;
}

export function SelectField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  options,
  description,
  placeholder,
  disabled,
  className,
  id,
  required,
}: SelectFieldProps<TFieldValues>) {
  const { field, fieldState } = useController({ control, name });
  const fieldId = id ?? `field-${String(name)}`;
  const hasError = !!fieldState.error;
  const descriptionId = description ? `${fieldId}-description` : undefined;
  const errorId = fieldState.error ? `${fieldId}-error` : undefined;
  const describedBy =
    [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <Field data-invalid={hasError || undefined}>
      <FieldLabel htmlFor={fieldId}>
        {label}
        {required ? " *" : null}
      </FieldLabel>
      <Select
        value={(field.value as string | undefined) ?? ""}
        onValueChange={field.onChange}
        disabled={disabled}
      >
        <SelectTrigger
          id={fieldId}
          className={cn("w-full", className)}
          aria-describedby={describedBy}
          aria-invalid={hasError || undefined}
          aria-required={required || undefined}
          onBlur={field.onBlur}
          ref={field.ref}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem
              key={opt.value}
              value={opt.value}
              disabled={opt.disabled}
            >
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description ? (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      ) : null}
      {fieldState.error ? (
        <FieldError id={errorId} errors={[fieldState.error]} />
      ) : null}
    </Field>
  );
}
