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
import { Textarea } from "@comtammatu/ui/components/textarea";

type TextareaProps = ComponentProps<typeof Textarea>;

export interface TextareaFieldProps<
  TFieldValues extends FieldValues,
> extends Omit<
  TextareaProps,
  "name" | "value" | "defaultValue" | "onChange" | "onBlur" | "ref" | "id"
> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  description?: string;
  id?: string;
  required?: boolean;
}

export function TextareaField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  id,
  required,
  className,
  ...textareaProps
}: TextareaFieldProps<TFieldValues>) {
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
      <Textarea
        id={fieldId}
        {...textareaProps}
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
