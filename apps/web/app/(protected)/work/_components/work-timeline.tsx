"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  addVNDateDays,
  formatVNDate,
  getVNDateString,
} from "@comtammatu/shared/time";
import { Frame } from "@comtammatu/ui/components/frame";
import { Progress } from "@comtammatu/ui/components/progress";
import { AppEmptyState } from "@/components/surface";
import type { WorkTaskRow } from "../actions";
import { workCopy } from "@lib/messages/work";

// page-archetype: TASK_TIMELINE

const TIMELINE_DAYS = 28;

export function WorkTimeline({ tasks }: { tasks: WorkTaskRow[] }) {
  const startDate = getVNDateString();
  const endDate = addVNDateDays(startDate, TIMELINE_DAYS - 1);

  const rangedTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.dueAt != null)
        .sort((left, right) =>
          (left.dueAt ?? "").localeCompare(right.dueAt ?? ""),
        ),
    [tasks],
  );

  if (rangedTasks.length === 0) {
    return (
      <AppEmptyState mode="no-data" description={workCopy.inboxEmpty} />
    );
  }

  return (
    <div data-page-archetype="TASK_TIMELINE" className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-semibold">
        {workCopy.timelineTitle}
      </h2>
      <p className="text-sm text-muted-foreground">
        {formatVNDate(startDate)} – {formatVNDate(endDate)}
      </p>

      <div className="flex flex-col gap-2">
        {rangedTasks.map((task) => {
          const dueKey = getVNDateString(task.dueAt!);
          const offsetDays = Math.max(
            0,
            Math.min(
              TIMELINE_DAYS - 1,
              Math.round(
                (new Date(`${dueKey}T12:00:00Z`).getTime() -
                  new Date(`${startDate}T12:00:00Z`).getTime()) /
                  (24 * 60 * 60 * 1000),
              ),
            ),
          );
          const widthPercent = Math.max(
            8,
            ((offsetDays + 1) / TIMELINE_DAYS) * 100,
          );

          return (
            <Frame
              key={task.id}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-center gap-3 bg-background p-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/work/tasks/${task.id}`}
                  className="truncate font-medium hover:underline"
                >
                  {task.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {workCopy.due}: {formatVNDate(task.dueAt!)}
                </p>
              </div>
              <Progress value={widthPercent} className="h-3 rounded-full" />
            </Frame>
          );
        })}
      </div>
    </div>
  );
}
