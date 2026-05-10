"use client";

import type { ComponentProps } from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { useController } from "react-hook-form";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { Input } from "@comtammatu/ui/components/input";

type InputProps = ComponentProps<typeof Input>;

export interface TextFieldProps<TFieldValues extends FieldValues> extends Omit<
  InputProps,
  "name" | "value" | "defaultValue" | "onChange" | "onBlur" | "ref" | "id"
> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  description?: string;
  id?: string;
  required?: boolean;
}

export function TextField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  id,
  required,
  className,
  ...inputProps
}: TextFieldProps<TFieldValues>) {
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
      <Input
        id={fieldId}
        {...inputProps}
        aria-describedby={describedBy}
        aria-invalid={hasError || undefined}
        aria-required={required || undefined}
        className={className}
        name={field.name}
        value={(field.value as string | undefined) ?? ""}
        onChange={field.onChange}
        onBlur={field.onBlur}
        ref={field.ref}
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
