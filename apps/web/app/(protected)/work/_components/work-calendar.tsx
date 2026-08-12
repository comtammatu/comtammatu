"use client";

import { getVNDateString, getVNMonthStartDateString, shiftVNMonth } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import type { WorkTaskRow } from "../actions";
import { workCopy } from "@lib/messages/work";
import { workHref, type ParsedWorkParams } from "../_lib/params";
import { WorkMonthGrid } from "./compose/work-month-grid";
import { WorkTaskChip } from "./compose/work-task-chip";

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
    <>
      <h2 className="font-heading text-lg font-semibold">
        {workCopy.calendarTitle} · {monthLabel(year, month)}
      </h2>

      <WorkMonthGrid
        monthStart={monthStart}
        todayKey={today}
        prevHref={workHref(params, { month: prevMonth })}
        nextHref={workHref(params, { month: nextMonth })}
        renderDayContent={(cell) => {
          if (!cell.date) return null;
          const dayTasks = tasksByDate.get(cell.date) ?? [];
          return (
            <>
              {dayTasks.slice(0, 3).map((task) => (
                <WorkTaskChip key={task.id} taskId={task.id} title={task.title} />
              ))}
              {dayTasks.length > 3 ? (
                <Badge variant="secondary" className="w-fit text-3xs">
                  +{dayTasks.length - 3}
                </Badge>
              ) : null}
            </>
          );
        }}
      />
    </>
  );
}
