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
  const [open, setOpen] = React.useState(false);
  const { field, fieldState } = useController({ control, name });
  const fieldId = id ?? `field-${String(name)}`;
  const hasError = !!fieldState.error;
  const rawValue = typeof field.value === "string" ? field.value : "";
  const selectedDate = businessDateToDate(rawValue);

  return (
    <Field data-disabled={disabled} data-invalid={hasError}>
      <FieldLabel htmlFor={fieldId}>
        {label}
        {required ? " *" : null}
      </FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={fieldId}
              type="button"
              variant="outline"
              size="field"
              aria-invalid={hasError}
              disabled={disabled}
              className={cn(
                "justify-start text-left font-normal",
                !rawValue && "text-muted-foreground",
                className,
              )}
            >
              <IconCalendarEvent data-icon="inline-start" />
              {rawValue ? formatVNBusinessDate(rawValue) : placeholder}
            </Button>
          }
        />
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            locale={vi}
            selected={selectedDate}
            onSelect={(date) => {
              field.onChange(date ? dateToBusinessDate(date) : "");
              setOpen(false);
            }}
            disabled={disabled}
          />
        </PopoverContent>
      </Popover>
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
