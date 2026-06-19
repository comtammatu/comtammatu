"use client";

import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { Switch } from "@comtammatu/ui/components/switch";
import { AppSection } from "./surface";

interface SettingsFormSectionProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  error?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function SettingsFormSection({
  title,
  description,
  children,
  error,
  footer,
  className,
}: SettingsFormSectionProps) {
  return (
    <AppSection
      title={title}
      description={description}
      footer={footer}
      className={className}
    >
      <FieldGroup>
        {children}
        {error ? <FieldError>{error}</FieldError> : null}
      </FieldGroup>
    </AppSection>
  );
}

export function SettingsFieldGrid({
  className,
  ...props
}: React.ComponentProps<typeof FieldGroup>) {
  return (
    <FieldGroup
      className={cn("grid gap-4 sm:grid-cols-2", className)}
      {...props}
    />
  );
}

interface SettingsSwitchRowProps {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function SettingsSwitchRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: SettingsSwitchRowProps) {
  return (
    <Field orientation="horizontal" data-disabled={disabled || undefined}>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description ? (
          <FieldDescription>{description}</FieldDescription>
        ) : null}
      </FieldContent>
    </Field>
  );
}

export interface CheckboxCardOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

interface CheckboxCardGroupProps {
  value: string[];
  options: CheckboxCardOption[];
  onValueChange: (value: string[]) => void;
  className?: string;
}

export function CheckboxCardGroup({
  value,
  options,
  onValueChange,
  className,
}: CheckboxCardGroupProps) {
  const selected = new Set(value);

  return (
    <FieldGroup data-slot="checkbox-group" className={className}>
      {options.map((option) => {
        const checked = selected.has(option.value);
        return (
          <Field
            key={option.value}
            orientation="horizontal"
            data-disabled={option.disabled || undefined}
            className="rounded-md border p-3"
          >
            <Checkbox
              checked={checked}
              disabled={option.disabled}
              onCheckedChange={(nextChecked) => {
                const next = new Set(selected);
                if (nextChecked === true) {
                  next.add(option.value);
                } else {
                  next.delete(option.value);
                }
                onValueChange([...next]);
              }}
            />
            <FieldContent>
              <FieldLabel>{option.label}</FieldLabel>
              {option.description ? (
                <FieldDescription>{option.description}</FieldDescription>
              ) : null}
            </FieldContent>
          </Field>
        );
      })}
    </FieldGroup>
  );
}
