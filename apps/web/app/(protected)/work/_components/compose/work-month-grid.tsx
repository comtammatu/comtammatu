"use client";

import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import { Frame } from "@comtammatu/ui/components/frame";
import {
  getVNMonthCalendarCells,
  type VNMonthCalendarCell,
} from "@comtammatu/shared/time";
import {
  WORK_MONTH_CELL,
  WORK_MONTH_CELL_TODAY,
  WORK_MONTH_DAY_GRID,
  WORK_MONTH_WEEKDAY_ROW,
} from "../../_lib/compose-styles";

const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;

export function WorkMonthGrid({
  monthStart,
  todayKey,
  prevHref: _prevHref,
  nextHref: _nextHref,
  renderDayContent,
}: {
  monthStart: string;
  todayKey: string;
  prevHref?: string;
  nextHref?: string;
  renderDayContent: (cell: VNMonthCalendarCell) => ReactNode;
}) {
  const cells = getVNMonthCalendarCells(monthStart);

  return (
    <div className="flex flex-col gap-2">
      <div className={WORK_MONTH_WEEKDAY_ROW}>
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-1 font-semibold">
            {label}
          </div>
        ))}
      </div>

      <div className={WORK_MONTH_DAY_GRID}>
        {cells.map((cell, index) => {
          if (!cell.date || cell.day == null) {
            return (
              <div
                key={`empty-${index}`}
                className="min-h-24"
                aria-hidden
              />
            );
          }
          const isToday = cell.isToday || cell.date === todayKey;
          return (
            <Frame
              key={cell.date}
              className={cn(
                WORK_MONTH_CELL,
                isToday ? WORK_MONTH_CELL_TODAY : undefined,
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {cell.day}
                </span>
              </div>
              <div className="flex flex-col gap-1">{renderDayContent(cell)}</div>
            </Frame>
          );
        })}
      </div>
    </div>
  );
}
