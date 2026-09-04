"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle as IconAlertTriangle,
  ExternalLink as IconExternalLink,
  User as IconUser,
} from "lucide-react";
import {
  formatISODateParts,
  formatVNDate,
  getVNDateParts,
} from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Frame } from "@comtammatu/ui/components/frame";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppEmptyState } from "@/components/surface";
import { useFormControlSize } from "@/components/form/control-size";
import {
  setWorkTaskStatus,
  type WorkTaskRow,
  type WorkTaskStatus,
} from "../actions";
import { workCopy } from "@lib/messages/work";
import {
  WORK_KANBAN_COLUMN,
  WORK_KANBAN_DESKTOP_GRID,
  WORK_TASK_VIEW_SHELL,
} from "../_lib/compose-styles";
import { workHref, type ParsedWorkParams } from "../_lib/params";
import { resolveWorkTaskDocumentLink } from "../_lib/document-links";

const BOARD_COLUMNS: WorkTaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
];

function parseTaskTitle(rawTitle: string) {
  const match = rawTitle.match(/^\[(Sự cố(?:\s*-\s*[^\]]+)?)\]\s*(.*)$/i);
  if (!match) {
    const isIncident = rawTitle.toLowerCase().includes("[sự cố");
    return {
      isIncident,
      subTag: null,
      cleanTitle: rawTitle,
    };
  }
  const fullTag = match[1]?.trim() ?? workCopy.incidentBadge;
  const parts = fullTag.split("-").map((s) => s.trim());
  const subTag = parts.length > 1 ? parts.slice(1).join(" - ") : null;
  const cleanTitle = match[2]?.trim() || rawTitle;
  return { isIncident: true, subTag, cleanTitle };
}

function sortColumnTasks(tasks: WorkTaskRow[]): WorkTaskRow[] {
  const now = Date.now();
  return [...tasks].sort((left, right) => {
    const leftIncident = left.title.toLowerCase().includes("[sự cố");
    const rightIncident = right.title.toLowerCase().includes("[sự cố");
    if (leftIncident !== rightIncident) return leftIncident ? -1 : 1;

    const leftUrgent = left.priority === "urgent";
    const rightUrgent = right.priority === "urgent";
    if (leftUrgent !== rightUrgent) return leftUrgent ? -1 : 1;

    const leftOverdue =
      left.dueAt != null &&
      new Date(left.dueAt).getTime() < now &&
      left.status !== "done" &&
      left.status !== "canceled";
    const rightOverdue =
      right.dueAt != null &&
      new Date(right.dueAt).getTime() < now &&
      right.status !== "done" &&
      right.status !== "canceled";
    if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;

    const leftHigh = left.priority === "high";
    const rightHigh = right.priority === "high";
    if (leftHigh !== rightHigh) return leftHigh ? -1 : 1;

    if (left.dueAt && right.dueAt) return left.dueAt.localeCompare(right.dueAt);
    if (left.dueAt) return -1;
    if (right.dueAt) return 1;

    return left.id - right.id;
  });
}

export function WorkBoard({
  tasks,
  params,
  assigneeNames = {},
}: {
  tasks: WorkTaskRow[];
  params: ParsedWorkParams;
  assigneeNames?: Record<string, string>;
}) {
  const todayStr = useMemo(
    () => formatISODateParts(getVNDateParts(new Date())),
    [],
  );

  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (params.filter === "urgent") {
      list = list.filter((t) => t.priority === "urgent");
    } else if (params.filter === "overdue") {
      const now = Date.now();
      list = list.filter(
        (t) =>
          t.dueAt != null &&
          new Date(t.dueAt).getTime() < now &&
          t.status !== "done" &&
          t.status !== "canceled",
      );
    } else if (params.filter === "today") {
      list = list.filter((t) => {
        if (!t.dueAt) return false;
        return formatISODateParts(getVNDateParts(new Date(t.dueAt))) === todayStr;
      });
    }
    if (params.q) {
      const needle = params.q.toLowerCase();
      list = list.filter((t) => t.title.toLowerCase().includes(needle));
    }
    return list;
  }, [tasks, params.filter, params.q, todayStr]);

  const [items, setItems] = useState(filteredTasks);
  useEffect(() => {
    setItems(filteredTasks);
  }, [filteredTasks]);

  const [activeStatus, setActiveStatus] = useState<WorkTaskStatus>("todo");
  const [dragOverCol, setDragOverCol] = useState<WorkTaskStatus | null>(null);
  const [isPending, startTransition] = useTransition();
  const controlSize = useFormControlSize();

  const grouped = useMemo(() => {
    const map = new Map<WorkTaskStatus, WorkTaskRow[]>();
    for (const column of BOARD_COLUMNS) map.set(column, []);
    for (const task of items) {
      if (task.status === "canceled") continue;
      const bucket = map.get(task.status as WorkTaskStatus);
      if (bucket) bucket.push(task);
      else map.get("backlog")?.push(task);
    }
    for (const column of BOARD_COLUMNS) {
      const list = map.get(column);
      if (list && list.length > 1) {
        map.set(column, sortColumnTasks(list));
      }
    }
    return map;
  }, [items]);

  const swimlanes = useMemo(() => {
    if (params.group !== "priority") return null;

    const urgentMap = new Map<WorkTaskStatus, WorkTaskRow[]>();
    const standardMap = new Map<WorkTaskStatus, WorkTaskRow[]>();
    for (const col of BOARD_COLUMNS) {
      urgentMap.set(col, []);
      standardMap.set(col, []);
    }

    let urgentCount = 0;
    let standardCount = 0;

    for (const [col, colTasks] of grouped.entries()) {
      for (const task of colTasks) {
        const isUrgentOrIncident =
          task.priority === "urgent" ||
          task.title.toLowerCase().includes("[sự cố");
        if (isUrgentOrIncident) {
          urgentMap.get(col)?.push(task);
          urgentCount += 1;
        } else {
          standardMap.get(col)?.push(task);
          standardCount += 1;
        }
      }
    }

    return { urgentMap, standardMap, urgentCount, standardCount };
  }, [params.group, grouped]);

  function moveTask(taskId: number, nextStatus: WorkTaskStatus) {
    const current = items.find((task) => task.id === taskId);
    if (!current || current.status === nextStatus) return;

    setItems((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, status: nextStatus } : task,
      ),
    );

    startTransition(async () => {
      const result = await setWorkTaskStatus({
        taskId,
        expectedRevision: current.revision,
        status: nextStatus,
      });
      if (!result.success || !result.data) {
        setItems((prev) =>
          prev.map((task) => (task.id === taskId ? current : task)),
        );
        toast.error(result.error ?? workCopy.saveFailed);
        return;
      }
      setItems((prev) =>
        prev.map((task) => (task.id === taskId ? result.data! : task)),
      );
    });
  }

  function renderCard(task: WorkTaskRow) {
    const { isIncident, subTag, cleanTitle } = parseTaskTitle(task.title);
    const docLink = resolveWorkTaskDocumentLink({
      title: task.title,
      description: task.description,
    });
    const assigneeName = task.assigneeId ? assigneeNames[task.assigneeId] : null;

    const now = Date.now();
    const isOverdue =
      task.dueAt != null &&
      new Date(task.dueAt).getTime() < now &&
      task.status !== "done" &&
      task.status !== "canceled";
    const isDueToday =
      task.dueAt != null &&
      formatISODateParts(getVNDateParts(new Date(task.dueAt))) === todayStr;

    return (
      <Item
        key={task.id}
        variant="outline"
        draggable={!isPending}
        onDragStart={(event) => {
          event.dataTransfer.setData("text/task-id", String(task.id));
          event.dataTransfer.effectAllowed = "move";
        }}
        className={`cursor-grab bg-background active:cursor-grabbing ${
          isIncident ? "border-destructive" : ""
        }`}
      >
        <ItemContent className="gap-1.5">
          <div className="flex flex-wrap items-start justify-between gap-1">
            <div className="flex flex-wrap items-center gap-1">
              {isIncident ? (
                <Badge variant="destructive" className="shrink-0">
                  {workCopy.incidentBadge}
                </Badge>
              ) : null}
              {subTag ? (
                <Badge variant="outline" className="shrink-0 text-2xs">
                  {subTag}
                </Badge>
              ) : null}
              {docLink ? (
                <a
                  href={docLink.href}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-2xs font-medium text-primary hover:bg-primary/20 hover:underline"
                >
                  <span>{docLink.label}</span>
                  <IconExternalLink className="size-2.5" />
                </a>
              ) : null}
            </div>
            <Badge
              variant={
                task.priority === "urgent"
                  ? "destructive"
                  : task.priority === "high"
                    ? "warning"
                    : task.priority === "normal"
                      ? "secondary"
                      : "outline"
              }
            >
              {workCopy.priorityLabels[task.priority]}
            </Badge>
          </div>

          <ItemTitle className="text-sm font-semibold leading-snug">
            <Link
              href={workHref(params, { taskId: task.id })}
              scroll={false}
              className="hover:underline"
            >
              {cleanTitle}
            </Link>
          </ItemTitle>

          <ItemDescription className="flex flex-col gap-1.5 pt-0.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-1">
              {task.assigneeId ? (
                <span className="inline-flex max-w-40 items-center gap-1 truncate text-muted-foreground">
                  <IconUser className="size-3 shrink-0" />
                  <span className="truncate">
                    {assigneeName ?? task.assigneeId.slice(0, 8)}
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-2xs italic text-muted-foreground/50">
                  <IconUser className="size-3 shrink-0 opacity-50" />
                  <span>{workCopy.unassigned}</span>
                </span>
              )}

              {task.dueAt ? (
                <span
                  className={`font-mono tabular-nums text-xs ${
                    isOverdue
                      ? "font-medium text-destructive"
                      : isDueToday
                        ? "font-medium text-warning"
                        : "text-muted-foreground"
                  }`}
                >
                  {workCopy.due}: {formatVNDate(task.dueAt)}
                </span>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-1 border-t border-border/20 pt-1">
              {task.status !== "todo" && task.status !== "backlog" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  title={workCopy.stepPrev}
                  aria-label={workCopy.stepPrev}
                  className="h-6 w-6 p-0 text-xs text-muted-foreground"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const prevIdx =
                      BOARD_COLUMNS.indexOf(task.status as WorkTaskStatus) - 1;
                    if (prevIdx >= 0) moveTask(task.id, BOARD_COLUMNS[prevIdx]!);
                  }}
                >
                  ◀
                </Button>
              ) : null}
              {task.status !== "done" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  title={workCopy.stepNext}
                  aria-label={workCopy.stepNext}
                  className="h-6 w-6 p-0 text-xs font-semibold text-primary"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const nextIdx =
                      BOARD_COLUMNS.indexOf(task.status as WorkTaskStatus) + 1;
                    if (nextIdx < BOARD_COLUMNS.length)
                      moveTask(task.id, BOARD_COLUMNS[nextIdx]!);
                  }}
                >
                  ▶
                </Button>
              ) : null}
            </div>
          </ItemDescription>
        </ItemContent>
      </Item>
    );
  }

  function renderColumn(status: WorkTaskStatus, columnTasks: WorkTaskRow[]) {
    const isDragOver = dragOverCol === status;
    return (
      <Frame
        key={status}
        className={`${WORK_KANBAN_COLUMN} ${
          isDragOver ? "ring-2 ring-primary/20 bg-primary/10" : ""
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDragEnter={() => setDragOverCol(status)}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setDragOverCol(null);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragOverCol(null);
          const raw = event.dataTransfer.getData("text/task-id");
          const taskId = Number(raw);
          if (!Number.isFinite(taskId)) return;
          moveTask(taskId, status);
        }}
      >
        <header className="flex items-center justify-between gap-2 px-1 pb-1">
          <h3 className="text-sm font-semibold">
            {workCopy.statusLabels[status]}
          </h3>
          <Badge variant={columnTasks.length > 0 ? "secondary" : "outline"}>
            {columnTasks.length}
          </Badge>
        </header>
        <div className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-0.5">
          {columnTasks.map(renderCard)}
        </div>
      </Frame>
    );
  }

  if (items.filter((task) => task.status !== "canceled").length === 0) {
    return (
      <AppEmptyState mode="no-data" description={workCopy.inboxEmpty} />
    );
  }

  return (
    <div className={WORK_TASK_VIEW_SHELL}>
      <div className="flex flex-wrap gap-1.5 md:hidden">
        {BOARD_COLUMNS.map((status) => {
          const count = grouped.get(status)?.length ?? 0;
          return (
            <Button
              key={status}
              type="button"
              variant={activeStatus === status ? "secondary" : "outline"}
              size={controlSize}
              onClick={() => setActiveStatus(status)}
              className="flex items-center gap-1.5"
            >
              <span>{workCopy.statusLabels[status]}</span>
              <Badge
                variant={activeStatus === status ? "outline" : "secondary"}
                className="px-1.5 py-0 text-2xs"
              >
                {count}
              </Badge>
            </Button>
          );
        })}
      </div>

      <div className="md:hidden">
        {renderColumn(activeStatus, grouped.get(activeStatus) ?? [])}
      </div>

      {swimlanes ? (
        <div className="hidden flex-col gap-4 md:flex">
          {swimlanes.urgentCount > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 px-1 text-xs font-semibold text-destructive">
                <IconAlertTriangle className="size-4 shrink-0" />
                <span>
                  {workCopy.laneUrgent} ({swimlanes.urgentCount})
                </span>
              </div>
              <div className={WORK_KANBAN_DESKTOP_GRID}>
                {BOARD_COLUMNS.map((col) =>
                  renderColumn(col, swimlanes.urgentMap.get(col) ?? []),
                )}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 px-1 text-xs font-semibold text-muted-foreground">
              <span>
                {workCopy.laneStandard} ({swimlanes.standardCount})
              </span>
            </div>
            <div className={WORK_KANBAN_DESKTOP_GRID}>
              {BOARD_COLUMNS.map((col) =>
                renderColumn(col, swimlanes.standardMap.get(col) ?? []),
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className={WORK_KANBAN_DESKTOP_GRID}>
          {BOARD_COLUMNS.map((status) =>
            renderColumn(status, grouped.get(status) ?? []),
          )}
        </div>
      )}
    </div>
  );
}
