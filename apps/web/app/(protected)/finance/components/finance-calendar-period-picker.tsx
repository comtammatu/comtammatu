"use client";

import * as React from "react";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@comtammatu/ui/components/popover";
import {
  CalendarDays as IconCalendarEvent,
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
} from "lucide-react";
import { BusinessWeekPicker } from "@/components/form";
import { messages } from "@lib/messages";
import {
  type FinanceCalendarPeriod,
  getFinanceCalendarPeriodSelection,
  resolveFinanceCalendarPeriod,
} from "../_lib/finance-params";

const BUSINESS_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const filterCopy = messages.finance.filterBar;

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function dateToBusinessDate(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function businessDateToDate(value?: string | null) {
  if (!value) return undefined;
  const match = BUSINESS_DATE_PATTERN.exec(value);
  if (!match) return undefined;
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

function parseSelectionYear(
  period: FinanceCalendarPeriod,
  selection: string,
): number {
  if (period === "year") {
    const year = Number(selection);
    return Number.isFinite(year) ? year : new Date().getFullYear();
  }
  const year = Number(selection.slice(0, 4));
  return Number.isFinite(year) ? year : new Date().getFullYear();
}

interface FinanceCalendarPeriodPickerProps {
  period: FinanceCalendarPeriod;
  selection: string;
  displayValue?: React.ReactNode;
  placeholder?: string;
  max: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
  onSelectionChange: (selection: string) => void;
}

export function FinanceCalendarPeriodPicker({
  period,
  selection,
  displayValue,
  placeholder,
  max,
  disabled,
  className,
  id,
  "aria-label": ariaLabel,
  onSelectionChange,
}: FinanceCalendarPeriodPickerProps) {
  const [open, setOpen] = React.useState(false);
  const maxDate = businessDateToDate(max);
  const resolved = selection
    ? resolveFinanceCalendarPeriod(period, selection, maxDate ?? new Date())
    : null;
  const selectedStart = businessDateToDate(resolved?.start);
  const selectedEnd = businessDateToDate(resolved?.end);
  const viewYearSeed = parseSelectionYear(period, selection);
  const [viewYear, setViewYear] = React.useState(viewYearSeed);
  const [decadeStart, setDecadeStart] = React.useState(
    Math.floor(viewYearSeed / 10) * 10,
  );

  React.useEffect(() => {
    if (!open) return;
    const nextYear = parseSelectionYear(period, selection);
    setViewYear(nextYear);
    setDecadeStart(Math.floor(nextYear / 10) * 10);
  }, [open, period, selection]);

  function commitSelection(next: string) {
    const range = resolveFinanceCalendarPeriod(
      period,
      next,
      maxDate ?? new Date(),
    );
    if (!range) return;
    onSelectionChange(next);
    setOpen(false);
  }

  function isPeriodDisabled(next: string) {
    return (
      resolveFinanceCalendarPeriod(period, next, maxDate ?? new Date()) == null
    );
  }

  const maxYear = maxDate?.getFullYear() ?? new Date().getFullYear();

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
            disabled={disabled}
            className={cn(
              "w-full justify-start text-left font-normal",
              !selection && "text-muted-foreground",
              className,
            )}
          >
            <IconCalendarEvent data-icon="inline-start" />
            {selection ? (displayValue ?? selection) : placeholder}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-auto p-0">
        {period === "week" ? (
          <BusinessWeekPicker
            selectedStart={selectedStart}
            selectedEnd={selectedEnd}
            maxDate={maxDate}
            onPickDay={(date) => {
              const day = dateToBusinessDate(date);
              commitSelection(
                getFinanceCalendarPeriodSelection("week", {
                  start: day,
                  end: day,
                }),
              );
            }}
          />
        ) : null}

        {period === "month" ? (
          <YearNavPanel
            label={String(viewYear)}
            canGoPrev
            canGoNext={viewYear < maxYear}
            onPrev={() => setViewYear((year) => year - 1)}
            onNext={() => setViewYear((year) => year + 1)}
          >
            <div className="grid grid-cols-3 gap-1 p-2 pt-0">
              {Array.from({ length: 12 }, (_, index) => {
                const month = index + 1;
                const next = `${viewYear}-${padDatePart(month)}`;
                const isSelected = selection === next;
                return (
                  <Button
                    key={next}
                    type="button"
                    variant={isSelected ? "default" : "ghost"}
                    size="sm"
                    disabled={isPeriodDisabled(next)}
                    className="w-full"
                    onClick={() => commitSelection(next)}
                  >
                    {filterCopy.monthShort(month)}
                  </Button>
                );
              })}
            </div>
          </YearNavPanel>
        ) : null}

        {period === "quarter" ? (
          <YearNavPanel
            label={String(viewYear)}
            canGoPrev
            canGoNext={viewYear < maxYear}
            onPrev={() => setViewYear((year) => year - 1)}
            onNext={() => setViewYear((year) => year + 1)}
          >
            <div className="grid grid-cols-2 gap-1 p-2 pt-0">
              {([1, 2, 3, 4] as const).map((quarter) => {
                const next = `${viewYear}-Q${quarter}`;
                const isSelected = selection === next;
                return (
                  <Button
                    key={next}
                    type="button"
                    variant={isSelected ? "default" : "ghost"}
                    size="sm"
                    disabled={isPeriodDisabled(next)}
                    className="w-full"
                    onClick={() => commitSelection(next)}
                  >
                    {filterCopy.quarterOption(quarter)}
                  </Button>
                );
              })}
            </div>
          </YearNavPanel>
        ) : null}

        {period === "year" ? (
          <YearNavPanel
            label={`${decadeStart}–${decadeStart + 9}`}
            canGoPrev
            canGoNext={decadeStart + 10 <= maxYear}
            onPrev={() => setDecadeStart((start) => start - 10)}
            onNext={() => setDecadeStart((start) => start + 10)}
          >
            <div className="grid grid-cols-3 gap-1 p-2 pt-0">
              {Array.from({ length: 10 }, (_, index) => {
                const year = decadeStart + index;
                const next = String(year);
                const isSelected = selection === next;
                return (
                  <Button
                    key={next}
                    type="button"
                    variant={isSelected ? "default" : "ghost"}
                    size="sm"
                    disabled={isPeriodDisabled(next)}
                    className="w-full"
                    onClick={() => commitSelection(next)}
                  >
                    {year}
                  </Button>
                );
              })}
            </div>
          </YearNavPanel>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function YearNavPanel({
  label,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
  children,
}: {
  label: string;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-64 p-2">
      <div className="mb-2 flex items-center justify-between gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={filterCopy.periodPrevAria}
          disabled={!canGoPrev}
          onClick={onPrev}
        >
          <IconChevronLeft />
        </Button>
        <p className="text-sm font-medium">{label}</p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={filterCopy.periodNextAria}
          disabled={!canGoNext}
          onClick={onNext}
        >
          <IconChevronRight />
        </Button>
      </div>
      {children}
    </div>
  );
}
