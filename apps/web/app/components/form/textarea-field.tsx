"use client";

import type { ComponentProps } from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { useController } from "react-hook-form";
import { cn } from "@comtammatu/ui";
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

  return (
    <Field data-invalid={hasError}>
      <FieldLabel htmlFor={fieldId}>
        {label}
        {required ? " *" : null}
      </FieldLabel>
      <Textarea
        id={fieldId}
        aria-invalid={hasError}
        className={cn("min-h-24", className)}
        {...textareaProps}
        name={field.name}
        value={(field.value as string | undefined) ?? ""}
        onChange={field.onChange}
        onBlur={field.onBlur}
        ref={field.ref}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {fieldState.error ? <FieldError errors={[fieldState.error]} /> : null}
    </Field>
  );
}
