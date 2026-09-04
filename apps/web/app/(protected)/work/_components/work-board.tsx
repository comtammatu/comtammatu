"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { formatVNDate } from "@comtammatu/shared/time";
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

const BOARD_COLUMNS: WorkTaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
];

export function WorkBoard({
  tasks,
  params,
}: {
  tasks: WorkTaskRow[];
  params: ParsedWorkParams;
}) {
  const [items, setItems] = useState(tasks);
  const [activeStatus, setActiveStatus] = useState<WorkTaskStatus>("todo");
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
    return map;
  }, [items]);

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
    const isIncident = task.title.toLowerCase().includes("[sự cố");
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
        <ItemContent className="gap-1">
          <div className="flex items-start justify-between gap-1">
            <ItemTitle className="text-sm font-semibold">
              <Link
                href={workHref(params, { taskId: task.id })}
                scroll={false}
                className="hover:underline"
              >
                {task.title}
              </Link>
            </ItemTitle>
            {isIncident ? (
              <Badge variant="destructive" className="shrink-0">
                {workCopy.incidentBadge}
              </Badge>
            ) : null}
          </div>
          <ItemDescription className="flex flex-wrap items-center justify-between gap-1 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              {task.dueAt ? (
                <span>
                  {workCopy.due}: {formatVNDate(task.dueAt)}
                </span>
              ) : null}
              <Badge
                variant={
                  task.priority === "urgent"
                    ? "destructive"
                    : task.priority === "high"
                      ? "warning"
                      : "secondary"
                }
              >
                {workCopy.priorityLabels[task.priority]}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
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
                  className="h-6 w-6 p-0 text-xs text-primary font-semibold"
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

  function renderColumn(status: WorkTaskStatus) {
    const columnTasks = grouped.get(status) ?? [];
    return (
      <Frame
        key={status}
        className={WORK_KANBAN_COLUMN}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          event.preventDefault();
          const raw = event.dataTransfer.getData("text/task-id");
          const taskId = Number(raw);
          if (!Number.isFinite(taskId)) return;
          moveTask(taskId, status);
        }}
      >
        <header className="flex items-center justify-between gap-2 px-1">
          <h3 className="text-sm font-semibold">
            {workCopy.statusLabels[status]}
          </h3>
          <Badge variant="secondary">{columnTasks.length}</Badge>
        </header>
        <div className="flex flex-col gap-2">{columnTasks.map(renderCard)}</div>
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
      <div className="flex flex-wrap gap-1 md:hidden">
        {BOARD_COLUMNS.map((status) => (
          <Button
            key={status}
            type="button"
            variant={activeStatus === status ? "secondary" : "outline"}
            size={controlSize}
            onClick={() => setActiveStatus(status)}
          >
            {workCopy.statusLabels[status]}
          </Button>
        ))}
      </div>

      <div className="md:hidden">{renderColumn(activeStatus)}</div>

      <div className={WORK_KANBAN_DESKTOP_GRID}>
        {BOARD_COLUMNS.map(renderColumn)}
      </div>
    </div>
  );
}
