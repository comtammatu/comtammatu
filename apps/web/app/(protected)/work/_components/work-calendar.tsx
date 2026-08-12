"use client";

import Link from "next/link";
import {
  getVNDateString,
  getVNMonthCalendarCells,
  getVNMonthStartDateString,
  shiftVNMonth,
} from "@comtammatu/shared/time";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Frame } from "@comtammatu/ui/components/frame";
import type { WorkTaskRow } from "../actions";
import { workCopy } from "@lib/messages/work";
import { workHref, type ParsedWorkParams } from "../_lib/params";

// page-archetype: TASK_CALENDAR

function monthLabel(year: number, month: number): string {
  return `${String(month).padStart(2, "0")}/${year}`;
}

export function WorkCalendar({
  tasks,
  params,
}: {
  tasks: WorkTaskRow[];
  params: ParsedWorkParams;
}) {
  const monthStart =
    params.month != null ? `${params.month}-01` : getVNMonthStartDateString();
  const year = Number(monthStart.slice(0, 4));
  const month = Number(monthStart.slice(5, 7));
  const cells = getVNMonthCalendarCells(monthStart);
  const today = getVNDateString();

  const tasksByDate = new Map<string, WorkTaskRow[]>();
  for (const task of tasks) {
    if (!task.dueAt) continue;
    const key = getVNDateString(task.dueAt);
    const bucket = tasksByDate.get(key) ?? [];
    bucket.push(task);
    tasksByDate.set(key, bucket);
  }

  const prev = shiftVNMonth(year, month, -1);
  const next = shiftVNMonth(year, month, 1);
  const prevMonth = `${prev.year}-${String(prev.month).padStart(2, "0")}`;
  const nextMonth = `${next.year}-${String(next.month).padStart(2, "0")}`;

  return (
    <div data-page-archetype="TASK_CALENDAR" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">
          {workCopy.calendarTitle} · {monthLabel(year, month)}
        </h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<Link href={workHref(params, { month: prevMonth })} />}
          >
            ←
          </Button>
          <Button
            variant="outline"
            size="sm"
            render={<Link href={workHref(params, { month: nextMonth })} />}
          >
            →
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
        {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, index) => {
          if (!cell.date || cell.day == null) {
            return <div key={`empty-${index}`} className="min-h-24 rounded-md" />;
          }
          const dayTasks = tasksByDate.get(cell.date) ?? [];
          return (
            <Frame
              key={cell.date}
              className={cn(
                "min-h-24 p-1 text-left",
                cell.isToday || cell.date === today
                  ? "border-primary bg-primary/10"
                  : "bg-background",
              )}
            >
              <div className="mb-1 text-xs font-semibold tabular-nums">
                {cell.day}
              </div>
              <div className="flex flex-col gap-1">
                {dayTasks.slice(0, 3).map((task) => (
                  <Button
                    key={task.id}
                    variant="secondary"
                    size="xs"
                    className="h-auto w-full justify-start truncate px-1 py-0.5 text-2xs"
                    render={<Link href={`/work/tasks/${task.id}`} />}
                  >
                    {task.title}
                  </Button>
                ))}
                {dayTasks.length > 3 ? (
                  <Badge variant="secondary" className="w-fit text-3xs">
                    +{dayTasks.length - 3}
                  </Badge>
                ) : null}
              </div>
            </Frame>
          );
        })}
      </div>
    </div>
  );
}
