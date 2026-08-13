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
  displayValue?: React.ReactNode;
  placeholder?: string;
  min?: string;
  max?: string;
  captionLayout?: React.ComponentProps<typeof Calendar>["captionLayout"];
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

function calendarDisabled(
  disabled: boolean | undefined,
  minDate: Date | undefined,
  maxDate: Date | undefined,
) {
  if (disabled) return true;
  const matchers: Array<{ before: Date } | { after: Date }> = [];
  if (minDate) matchers.push({ before: minDate });
  if (maxDate) matchers.push({ after: maxDate });
  return matchers.length > 0 ? matchers : undefined;
}

export function BusinessDatePicker({
  value,
  onValueChange,
  displayValue,
  placeholder = "Chọn ngày",
  min,
  max,
  captionLayout,
  disabled,
  className,
  id,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: BusinessDatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selectedDate = businessDateToDate(value);
  const minDate = businessDateToDate(min);
  const maxDate = businessDateToDate(max);

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
            {value
              ? (displayValue ?? formatVNBusinessDate(value))
              : placeholder}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          locale={vi}
          captionLayout={captionLayout}
          defaultMonth={selectedDate}
          startMonth={minDate}
          endMonth={maxDate}
          selected={selectedDate}
          onSelect={(date) => {
            onValueChange(date ? dateToBusinessDate(date) : "");
            setOpen(false);
          }}
          disabled={calendarDisabled(disabled, minDate, maxDate)}
        />
      </PopoverContent>
    </Popover>
  );
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function isDateInRange(date: Date, start: Date, end: Date) {
  const t = startOfLocalDay(date);
  return t >= startOfLocalDay(start) && t <= startOfLocalDay(end);
}

function isSameBusinessDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export interface BusinessWeekPickerProps {
  selectedStart?: Date;
  selectedEnd?: Date;
  maxDate?: Date;
  onPickDay: (date: Date) => void;
}

export function BusinessWeekPicker({
  selectedStart,
  selectedEnd,
  maxDate,
  onPickDay,
}: BusinessWeekPickerProps) {
  const weekStart = selectedStart;
  const weekEnd = selectedEnd ?? selectedStart;

  return (
    <Calendar
      mode="single"
      locale={vi}
      captionLayout="dropdown"
      defaultMonth={selectedStart}
      endMonth={maxDate}
      selected={selectedStart}
      showOutsideDays
      modifiers={
        weekStart && weekEnd
          ? {
              period_week: (date) => isDateInRange(date, weekStart, weekEnd),
            }
          : undefined
      }
      modifiersClassNames={{
        period_week:
          "rounded-none bg-primary/15 text-foreground data-[selected-single=true]:rounded-(--cell-radius)",
      }}
      onSelect={(date) => {
        if (!date) return;
        if (maxDate && date > maxDate && !isSameBusinessDay(date, maxDate)) {
          return;
        }
        onPickDay(date);
      }}
      disabled={maxDate ? { after: maxDate } : undefined}
    />
  );
}

export interface BusinessDateFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  description?: string;
  timezoneLabel?: string;
  placeholder?: string;
  min?: string;
  max?: string;
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
  min,
  max,
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
        min={min}
        max={max}
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
