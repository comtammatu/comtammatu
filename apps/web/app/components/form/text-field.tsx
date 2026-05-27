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

  return (
    <Field data-invalid={hasError}>
      <FieldLabel htmlFor={fieldId}>
        {label}
        {required ? " *" : null}
      </FieldLabel>
      <Input
        id={fieldId}
        aria-invalid={hasError}
        className={cn("h-10", className)}
        {...inputProps}
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
