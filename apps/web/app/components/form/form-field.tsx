"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@comtammatu/ui/components/field";

export interface FormFieldProps extends Omit<
  ComponentProps<typeof Field>,
  "children"
> {
  controlId?: string;
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  children: ReactNode;
}

export function FormField({
  controlId,
  label,
  description,
  error,
  required,
  disabled,
  children,
  ...fieldProps
}: FormFieldProps) {
  const invalid = Boolean(error);

  return (
    <Field
      {...fieldProps}
      data-disabled={disabled || undefined}
      data-invalid={invalid || undefined}
    >
      <FieldLabel htmlFor={controlId}>
        {label}
        {required ? " *" : null}
      </FieldLabel>
      {children}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}
