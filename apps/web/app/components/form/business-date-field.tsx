"use client";

import * as React from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { useController } from "react-hook-form";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { Calendar, vi } from "@comtammatu/ui/components/calendar";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@comtammatu/ui/components/popover";
import { formatVNBusinessDate } from "@comtammatu/shared/time";
import { CalendarDays as IconCalendarEvent } from "lucide-react";

const BUSINESS_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const BRANCH_TIMEZONE_LABEL = "Múi giờ chi nhánh";

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function dateToBusinessDate(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function businessDateToDate(value?: string | null) {
  if (!value) {
    return undefined;
  }

  const match = BUSINESS_DATE_PATTERN.exec(value);
  if (!match) {
    return undefined;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }

  return date;
}

export interface BusinessDatePickerProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

export function BusinessDatePicker({
  value,
  onValueChange,
  placeholder = "Chọn ngày",
  disabled,
  className,
  id,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: BusinessDatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selectedDate = businessDateToDate(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            size="field"
            aria-label={ariaLabel}
            aria-invalid={ariaInvalid}
            aria-describedby={ariaDescribedBy}
            disabled={disabled}
            className={cn(
              "w-full justify-start text-left font-normal",
              !value && "text-muted-foreground",
              className,
            )}
          >
            <IconCalendarEvent data-icon="inline-start" />
            {value ? formatVNBusinessDate(value) : placeholder}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          locale={vi}
          selected={selectedDate}
          onSelect={(date) => {
            onValueChange(date ? dateToBusinessDate(date) : "");
            setOpen(false);
          }}
          disabled={disabled}
        />
      </PopoverContent>
    </Popover>
  );
}

export interface BusinessDateFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  description?: string;
  timezoneLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  required?: boolean;
}

export function BusinessDateField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  timezoneLabel,
  placeholder = "Chọn ngày",
  disabled,
  className,
  id,
  required,
}: BusinessDateFieldProps<TFieldValues>) {
  const { field, fieldState } = useController({ control, name });
  const fieldId = id ?? `field-${String(name)}`;
  const hasError = !!fieldState.error;
  const rawValue = typeof field.value === "string" ? field.value : "";

  return (
    <Field data-disabled={disabled} data-invalid={hasError}>
      <FieldLabel htmlFor={fieldId}>
        {label}
        {required ? " *" : null}
      </FieldLabel>
      <BusinessDatePicker
        id={fieldId}
        value={rawValue}
        onValueChange={field.onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        aria-invalid={hasError}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {timezoneLabel ? (
        <FieldDescription>
          {BRANCH_TIMEZONE_LABEL}: {timezoneLabel}
        </FieldDescription>
      ) : null}
      {fieldState.error ? <FieldError errors={[fieldState.error]} /> : null}
    </Field>
  );
}
