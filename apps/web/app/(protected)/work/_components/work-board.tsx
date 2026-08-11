"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { cn } from "@comtammatu/ui";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppEmptyState } from "@/components/surface";
import {
  setWorkTaskStatus,
  type WorkTaskRow,
  type WorkTaskStatus,
} from "../actions";
import { workCopy } from "@lib/messages/work";

// page-archetype: TASK_BOARD

const BOARD_COLUMNS: WorkTaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
];

export function WorkBoard({ tasks }: { tasks: WorkTaskRow[] }) {
  const [items, setItems] = useState(tasks);
  const [activeStatus, setActiveStatus] = useState<WorkTaskStatus>("todo");
  const [isPending, startTransition] = useTransition();

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
    return (
      <Item
        key={task.id}
        variant="outline"
        draggable={!isPending}
        onDragStart={(event) => {
          event.dataTransfer.setData("text/task-id", String(task.id));
          event.dataTransfer.effectAllowed = "move";
        }}
        className="cursor-grab bg-background active:cursor-grabbing"
      >
        <ItemContent className="gap-1">
          <ItemTitle className="text-sm">
            <Link href={`/work/tasks/${task.id}`} className="hover:underline">
              {task.title}
            </Link>
          </ItemTitle>
          <ItemDescription className="flex flex-wrap gap-2 text-xs">
            {task.dueAt ? (
              <span>
                {workCopy.due}: {formatVNDate(task.dueAt)}
              </span>
            ) : null}
            <Badge variant="secondary">
              {workCopy.priorityLabels[task.priority]}
            </Badge>
          </ItemDescription>
        </ItemContent>
      </Item>
    );
  }

  function renderColumn(status: WorkTaskStatus) {
    const columnTasks = grouped.get(status) ?? [];
    return (
      <section
        key={status}
        className="flex min-h-48 flex-col gap-2 rounded-lg border bg-muted/20 p-2"
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
      </section>
    );
  }

  if (items.filter((task) => task.status !== "canceled").length === 0) {
    return (
      <AppEmptyState mode="no-data" description={workCopy.inboxEmpty} />
    );
  }

  return (
    <div data-page-archetype="TASK_BOARD" className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1 md:hidden">
        {BOARD_COLUMNS.map((status) => (
          <button
            key={status}
            type="button"
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm",
              activeStatus === status
                ? "border-primary bg-primary/10"
                : "border-border",
            )}
            onClick={() => setActiveStatus(status)}
          >
            {workCopy.statusLabels[status]}
          </button>
        ))}
      </div>

      <div className="md:hidden">{renderColumn(activeStatus)}</div>

      <div className="hidden gap-3 md:grid md:grid-cols-5">
        {BOARD_COLUMNS.map(renderColumn)}
      </div>
    </div>
  );
}
