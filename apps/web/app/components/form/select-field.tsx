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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";

interface SelectFieldOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectFieldOptionGroup {
  label: string;
  options: readonly SelectFieldOption[];
}

export interface SelectFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  /** Flat option list. Provide this OR `groups`, not both. */
  options?: readonly SelectFieldOption[];
  /** Grouped options rendered under section labels. */
  groups?: readonly SelectFieldOptionGroup[];
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
  groups,
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

  const renderItem = (opt: SelectFieldOption) => (
    <SelectItem key={opt.value} value={opt.value} disabled={opt.disabled}>
      {opt.label}
    </SelectItem>
  );

  return (
    <Field data-invalid={hasError}>
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
          size="field"
          className={cn("w-full", className)}
          aria-invalid={hasError}
          onBlur={field.onBlur}
          ref={field.ref}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {groups
            ? groups.map((group) => (
                <SelectGroup key={group.label}>
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.options.map(renderItem)}
                </SelectGroup>
              ))
            : options?.map(renderItem)}
        </SelectContent>
      </Select>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {fieldState.error ? <FieldError errors={[fieldState.error]} /> : null}
    </Field>
  );
}
