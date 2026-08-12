"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { Frame } from "@comtammatu/ui/components/frame";
import {
  getVNMonthCalendarCells,
  type VNMonthCalendarCell,
} from "@comtammatu/shared/time";
import { useFormControlSize } from "@/components/form/control-size";
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
  prevHref,
  nextHref,
  renderDayContent,
}: {
  monthStart: string;
  todayKey: string;
  prevHref: string;
  nextHref: string;
  renderDayContent: (cell: VNMonthCalendarCell) => ReactNode;
}) {
  const controlSize = useFormControlSize();
  const cells = getVNMonthCalendarCells(monthStart);

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size={controlSize}
          render={<Link href={prevHref} />}
        >
          ←
        </Button>
        <Button
          variant="outline"
          size={controlSize}
          render={<Link href={nextHref} />}
        >
          →
        </Button>
      </div>

      <div className={WORK_MONTH_WEEKDAY_ROW}>
        {WEEKDAY_LABELS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>

      <div className={WORK_MONTH_DAY_GRID}>
        {cells.map((cell, index) => {
          if (!cell.date || cell.day == null) {
            return (
              <div
                key={`empty-${index}`}
                className="min-h-24 rounded-md"
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
              <div className="mb-1 text-xs font-semibold tabular-nums">
                {cell.day}
              </div>
              <div className="flex flex-col gap-1">{renderDayContent(cell)}</div>
            </Frame>
          );
        })}
      </div>
    </>
  );
}
