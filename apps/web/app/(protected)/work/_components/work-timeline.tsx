"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Calendar as IconCalendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock as IconClock,
} from "lucide-react";
import { cn } from "@comtammatu/ui";
import {
  addVNDateDays,
  formatVNDate,
  getVNDateString,
  parseISODateParts,
} from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Frame } from "@comtammatu/ui/components/frame";
import { AppEmptyState } from "@/components/surface";
import { useFormControlSize } from "@/components/form/control-size";
import type { WorkDepartmentOption, WorkTaskRow } from "../actions";
import { workCopy } from "@lib/messages/work";
import { workHref, type ParsedWorkParams } from "../_lib/params";

const TIMELINE_DAYS = 21;
const VI_DAY_NAMES = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const;

function getDayDiff(fromIsoStr: string, toIsoStr: string): number {
  const fromParts = parseISODateParts(fromIsoStr);
  const toParts = parseISODateParts(toIsoStr);
  if (!fromParts || !toParts) return 0;
  const fromUtc = Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day);
  const toUtc = Date.UTC(toParts.year, toParts.month - 1, toParts.day);
  return Math.round((toUtc - fromUtc) / (24 * 60 * 60 * 1000));
}

function getDayOfWeekName(isoStr: string): { label: string; isWeekend: boolean } {
  const parts = parseISODateParts(isoStr);
  if (!parts) return { label: "", isWeekend: false };
  const dayIndex = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, 12),
  ).getUTCDay();
  const isWeekend = dayIndex === 0 || dayIndex === 6;
  return { label: VI_DAY_NAMES[dayIndex] ?? "", isWeekend };
}

function getStatusStyle(status: string) {
  switch (status) {
    case "done":
      return {
        barClass: "bg-success text-success-foreground hover:opacity-90",
        dotClass: "bg-success",
      };
    case "in_progress":
      return {
        barClass: "bg-info text-info-foreground hover:opacity-90",
        dotClass: "bg-info",
      };
    case "review":
      return {
        barClass: "bg-warning text-warning-foreground hover:opacity-90",
        dotClass: "bg-warning",
      };
    case "todo":
      return {
        barClass: "bg-primary text-primary-foreground hover:opacity-90",
        dotClass: "bg-primary",
      };
    case "backlog":
    default:
      return {
        barClass: "bg-muted text-muted-foreground hover:opacity-90",
        dotClass: "bg-muted-foreground",
      };
  }
}

export function WorkTimeline({
  tasks,
  params,
  departments = [],
  assigneeNames = {},
}: {
  tasks: WorkTaskRow[];
  params: ParsedWorkParams;
  departments?: WorkDepartmentOption[];
  assigneeNames?: Record<string, string>;
}) {
  const controlSize = useFormControlSize();
  const todayIso = useMemo(() => getVNDateString(), []);
  const [viewStart, setViewStart] = useState(() => addVNDateDays(todayIso, -2));

  const viewEnd = useMemo(
    () => addVNDateDays(viewStart, TIMELINE_DAYS - 1),
    [viewStart],
  );

  const days = useMemo(() => {
    return Array.from({ length: TIMELINE_DAYS }, (_, index) => {
      const dateStr = addVNDateDays(viewStart, index);
      const parts = parseISODateParts(dateStr);
      const { label, isWeekend } = getDayOfWeekName(dateStr);
      const isToday = dateStr === todayIso;
      return {
        dateStr,
        dayNum: parts?.day ?? 0,
        dayLabel: label,
        isToday,
        isWeekend,
      };
    });
  }, [viewStart, todayIso]);

  const departmentGroups = useMemo(() => {
    const map = new Map<number, WorkTaskRow[]>();
    for (const dept of departments) {
      map.set(dept.id, []);
    }
    const otherTasks: WorkTaskRow[] = [];

    const memberId = params.memberId;
    const effectiveTasks = memberId
      ? tasks.filter(
          (t) =>
            t.assigneeId === memberId ||
            t.participantIds?.includes(memberId) ||
            t.assigneeIds?.includes(memberId) ||
            t.supporterIds?.includes(memberId),
        )
      : tasks;

    for (const task of effectiveTasks) {
      if (task.status === "canceled") continue;
      if (task.departmentId != null && map.has(task.departmentId)) {
        map.get(task.departmentId)!.push(task);
      } else {
        otherTasks.push(task);
      }
    }

    const groups: {
      id: number;
      name: string;
      tasksWithDue: WorkTaskRow[];
      tasksWithoutDue: WorkTaskRow[];
    }[] = [];

    for (const dept of departments) {
      const deptTasks = map.get(dept.id) ?? [];
      if (deptTasks.length === 0) continue;
      const withDue = deptTasks
        .filter((t) => t.dueAt != null)
        .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
      const withoutDue = deptTasks.filter((t) => t.dueAt == null);
      groups.push({
        id: dept.id,
        name: dept.name,
        tasksWithDue: withDue,
        tasksWithoutDue: withoutDue,
      });
    }

    if (otherTasks.length > 0) {
      const withDue = otherTasks
        .filter((t) => t.dueAt != null)
        .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
      const withoutDue = otherTasks.filter((t) => t.dueAt == null);
      groups.push({
        id: 0,
        name: workCopy.departmentColumnOther,
        tasksWithDue: withDue,
        tasksWithoutDue: withoutDue,
      });
    }

    return groups;
  }, [tasks, departments, params.memberId]);

  if (tasks.filter((t) => t.status !== "canceled").length === 0) {
    return (
      <AppEmptyState mode="no-data" description={workCopy.inboxEmpty} />
    );
  }

  function handleShiftRange(offsetDays: number) {
    setViewStart((current) => addVNDateDays(current, offsetDays));
  }

  function handleResetToToday() {
    setViewStart(addVNDateDays(todayIso, -2));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-base font-semibold">
              {workCopy.timelineTitle}
            </h2>
            <Badge variant="secondary" className="font-mono text-2xs">
              {tasks.filter((t) => t.status !== "canceled").length}{" "}
              {workCopy.timelineDays}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {formatVNDate(viewStart)} – {formatVNDate(viewEnd)}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size={controlSize}
            onClick={handleResetToToday}
            className="flex items-center gap-1 text-xs"
          >
            <IconCalendar className="size-3.5" />
            <span>{workCopy.today}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            onClick={() => handleShiftRange(-7)}
            aria-label={workCopy.timelinePrevPeriod}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            onClick={() => handleShiftRange(7)}
            aria-label={workCopy.timelineNextPeriod}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>

      <Frame className="overflow-hidden bg-card shadow-xs">
        <div className="overflow-x-auto">
          <div className="w-max min-w-full">
            <div className="flex border-b border-border/40 bg-muted/30">
              <div className="w-72 shrink-0 border-r border-border/40 p-3 text-xs font-semibold text-muted-foreground md:w-80">
                {workCopy.scopeDepartment} / {workCopy.titleLabel}
              </div>

              <div className="flex flex-1">
                {days.map((day) => (
                  <div
                    key={day.dateStr}
                    className={cn(
                      "flex flex-1 min-w-8 flex-col items-center justify-center border-r border-border/20 py-1.5 text-center text-3xs",
                      day.isWeekend && "bg-muted/30 text-muted-foreground",
                      day.isToday && "bg-primary/10 font-semibold text-primary",
                    )}
                  >
                    <span className="text-muted-foreground">{day.dayLabel}</span>
                    <span
                      className={cn(
                        "mt-0.5 inline-flex size-5 items-center justify-center rounded-full font-mono",
                        day.isToday && "bg-primary text-primary-foreground font-semibold",
                      )}
                    >
                      {day.dayNum}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col">
              {departmentGroups.map((dept) => {
                const totalInDept =
                  dept.tasksWithDue.length + dept.tasksWithoutDue.length;
                return (
                  <div key={dept.id} className="flex flex-col border-b border-border/20 last:border-b-0">
                    <div className="flex items-center gap-2 border-b border-border/20 bg-muted/30 px-3 py-2">
                      <span className="size-2 rounded-full bg-primary" />
                      <span className="text-xs font-semibold text-foreground">
                        {dept.name}
                      </span>
                      <Badge variant="outline" className="px-1.5 py-0 font-mono text-3xs">
                        {totalInDept}
                      </Badge>
                    </div>

                    {dept.tasksWithDue.map((task) => {
                      const dueIso = getVNDateString(task.dueAt!);
                      const createdIso = getVNDateString(task.createdAt);

                      const diffFromStart = getDayDiff(viewStart, dueIso);
                      const startDiff = getDayDiff(viewStart, createdIso);

                      const clampedEnd = Math.max(0, Math.min(TIMELINE_DAYS - 1, diffFromStart));
                      const clampedStart = Math.max(
                        0,
                        Math.min(clampedEnd, Math.max(0, startDiff)),
                      );

                      const isDone = task.status === "done";
                      const isOverdue =
                        !isDone &&
                        task.status !== "canceled" &&
                        new Date(task.dueAt!).getTime() < Date.now();

                      const { barClass, dotClass } = getStatusStyle(task.status);
                      const assigneeName = task.assigneeId
                        ? assigneeNames[task.assigneeId]
                        : null;

                      return (
                        <div
                          key={task.id}
                          className="group flex border-b border-border/20 transition-colors hover:bg-muted/30 last:border-b-0"
                        >
                          <div className="flex w-72 shrink-0 items-center justify-between gap-2 border-r border-border/40 p-2.5 md:w-80">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className={cn("size-2 shrink-0 rounded-full", dotClass)} />
                              <Link
                                href={workHref(params, { taskId: task.id })}
                                scroll={false}
                                className="truncate text-xs font-medium text-foreground transition-colors hover:text-primary hover:underline"
                              >
                                {task.title}
                              </Link>
                            </div>

                            <div className="flex shrink-0 items-center gap-1.5">
                              {assigneeName ? (
                                <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted/50 font-mono text-3xs font-medium text-muted-foreground">
                                  {assigneeName.charAt(0).toUpperCase()}
                                </span>
                              ) : null}
                              <span
                                className={cn(
                                  "font-mono text-3xs",
                                  isOverdue
                                    ? "font-semibold text-destructive"
                                    : "text-muted-foreground",
                                )}
                              >
                                {formatVNDate(task.dueAt!)}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-1 items-center">
                            {days.map((day, dayIdx) => {
                              const isCovered =
                                dayIdx >= clampedStart && dayIdx <= clampedEnd;
                              const isStart = dayIdx === clampedStart;
                              const isEnd = dayIdx === clampedEnd;
                              const isSingle = clampedStart === clampedEnd;

                              if (!isCovered) {
                                return (
                                  <div
                                    key={day.dateStr}
                                    className={cn(
                                      "flex-1 min-w-8 h-8 border-r border-border/20",
                                      day.isWeekend && "bg-muted/30",
                                      day.isToday && "bg-primary/10",
                                    )}
                                  />
                                );
                              }

                              return (
                                <Link
                                  key={day.dateStr}
                                  href={workHref(params, { taskId: task.id })}
                                  scroll={false}
                                  className={cn(
                                    "flex-1 min-w-8 h-6 flex items-center border-r border-border/20 font-mono text-3xs transition-opacity hover:opacity-90",
                                    barClass,
                                    isSingle && "rounded-md px-1.5",
                                    !isSingle && isStart && "rounded-l-md pl-1.5",
                                    !isSingle && isEnd && "rounded-r-md pr-1.5",
                                    !isSingle && !isStart && !isEnd && "rounded-none",
                                    isOverdue && "ring-1 ring-destructive",
                                  )}
                                  title={`${task.title} (${workCopy.due}: ${formatVNDate(task.dueAt!)})`}
                                >
                                  {isStart ? (
                                    <div className="flex items-center gap-1 overflow-hidden whitespace-nowrap">
                                      {isDone ? (
                                        <CheckCircle2 className="size-3 shrink-0" />
                                      ) : isOverdue ? (
                                        <AlertCircle className="size-3 shrink-0" />
                                      ) : (
                                        <IconClock className="size-3 shrink-0 opacity-80" />
                                      )}
                                      <span className="truncate text-3xs font-medium">{task.title}</span>
                                    </div>
                                  ) : null}
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {dept.tasksWithoutDue.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-2 border-t border-border/20 bg-muted/30 px-3 py-1.5 text-2xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">
                          {workCopy.timelineNoDue} ({dept.tasksWithoutDue.length}):
                        </span>
                        {dept.tasksWithoutDue.map((task) => (
                          <Link
                            key={task.id}
                            href={workHref(params, { taskId: task.id })}
                            scroll={false}
                          >
                            <Badge
                              variant="outline"
                              className="gap-1 bg-background font-medium hover:border-primary/20 hover:text-primary"
                            >
                              <span className="size-1.5 rounded-full bg-muted-foreground" />
                              <span className="max-w-40 truncate">{task.title}</span>
                            </Badge>
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Frame>
    </div>
  );
}
