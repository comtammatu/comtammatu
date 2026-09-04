"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Clock as IconClock,
  ExternalLink as IconExternalLink,
  Plus as IconPlus,
  User as IconUser,
} from "lucide-react";
import { cn } from "@comtammatu/ui";
import {
  formatISODateParts,
  formatVNDate,
  getVNDateParts,
} from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Frame } from "@comtammatu/ui/components/frame";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  AppBoardCard,
  AppBoardColumn,
  AppBoardColumnAction,
  AppBoardColumnHeader,
  AppBoardCompletedSection,
  AppBoardGrid,
  AppBoardStatusDropdown,
  AppEmptyState,
} from "@/components/surface";
import { useFormControlSize } from "@/components/form/control-size";
import {
  setWorkTaskDepartment,
  setWorkTaskStatus,
  type WorkDepartmentOption,
  type WorkProfileOption,
  type WorkTaskRow,
  type WorkTaskStatus,
} from "../actions";
import { workCopy } from "@lib/messages/work";
import { workHref, type ParsedWorkParams } from "../_lib/params";
import { resolveWorkTaskDocumentLink } from "../_lib/document-links";
import { WORK_KANBAN_COLUMN } from "../_lib/compose-styles";
import { WorkCreateDialog } from "./work-create-dialog";

const STATUS_OPTIONS: WorkTaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
];

function getStatusBadgeProps(status: string): {
  dotClass: string;
} {
  switch (status) {
    case "done":
      return { dotClass: "bg-success" };
    case "in_progress":
      return { dotClass: "bg-info" };
    case "review":
      return { dotClass: "bg-warning" };
    case "todo":
      return { dotClass: "bg-primary" };
    case "backlog":
    default:
      return { dotClass: "bg-muted-foreground" };
  }
}

type BoardColumn = {
  id: number;
  name: string;
  isOther?: boolean;
};

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
  departments = [],
  membersByDepartment = {},
}: {
  tasks: WorkTaskRow[];
  params: ParsedWorkParams;
  assigneeNames?: Record<string, string>;
  departments?: WorkDepartmentOption[];
  membersByDepartment?: Record<number, WorkProfileOption[]>;
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

  const departmentMap = useMemo(() => {
    const map = new Map<number, WorkDepartmentOption>();
    for (const d of departments) {
      map.set(d.id, d);
    }
    return map;
  }, [departments]);

  const columns: BoardColumn[] = useMemo(() => {
    const list: BoardColumn[] = departments.map((d) => ({
      id: d.id,
      name: d.name,
    }));
    const hasUnmatched = items.some(
      (t) => t.status !== "canceled" && !departmentMap.has(t.departmentId),
    );
    if (hasUnmatched) {
      list.push({
        id: -1,
        name: workCopy.departmentColumnOther,
        isOther: true,
      });
    }
    return list;
  }, [departments, items, departmentMap]);

  const [activeDeptId, setActiveDeptId] = useState<number>(
    columns[0]?.id ?? (departments[0]?.id || 1),
  );
  useEffect(() => {
    if (columns.length > 0 && !columns.some((c) => c.id === activeDeptId)) {
      setActiveDeptId(columns[0]!.id);
    }
  }, [columns, activeDeptId]);

  const [collapsedDone, setCollapsedDone] = useState<Record<number, boolean>>({});
  const [dragOverCol, setDragOverCol] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const controlSize = useFormControlSize();

  const grouped = useMemo(() => {
    const map = new Map<number, WorkTaskRow[]>();
    for (const col of columns) {
      map.set(col.id, []);
    }
    for (const task of items) {
      if (task.status === "canceled") continue;
      if (departmentMap.has(task.departmentId)) {
        map.get(task.departmentId)?.push(task);
      } else {
        map.get(-1)?.push(task);
      }
    }
    return map;
  }, [columns, items, departmentMap]);

  function moveTaskStatus(taskId: number, nextStatus: WorkTaskStatus) {
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
      toast.success(workCopy.statusChange);
    });
  }

  function moveTaskDepartment(taskId: number, targetDepartmentId: number) {
    if (targetDepartmentId <= 0) return;
    const current = items.find((task) => task.id === taskId);
    if (!current || current.departmentId === targetDepartmentId) return;

    setItems((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, departmentId: targetDepartmentId } : task,
      ),
    );

    startTransition(async () => {
      const result = await setWorkTaskDepartment({
        taskId,
        expectedRevision: current.revision,
        departmentId: targetDepartmentId,
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
      toast.success(workCopy.departmentMoved);
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

    const statusBadge = getStatusBadgeProps(task.status);
    const isDragging = draggingId === task.id;

    return (
      <AppBoardCard
        key={task.id}
        draggable={!isPending}
        isDragging={isDragging}
        onDragStart={(event) => {
          setDraggingId(task.id);
          event.dataTransfer.setData("text/task-id", String(task.id));
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => setDraggingId(null)}
        className={cn(
          "cursor-grab active:cursor-grabbing",
          isIncident && "border-destructive",
        )}
      >
        <ItemContent className="gap-2">
          <div className="flex flex-wrap items-start justify-between gap-1.5">
            <div className="flex flex-wrap items-center gap-1">
              {isIncident ? (
                <Badge variant="destructive" className="shrink-0 text-3xs font-semibold">
                  {workCopy.incidentBadge}
                </Badge>
              ) : null}
              {subTag ? (
                <Badge variant="outline" className="shrink-0 text-3xs font-normal">
                  {subTag}
                </Badge>
              ) : null}
              {docLink ? (
                <a
                  href={docLink.href}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-3xs font-medium text-primary hover:bg-primary/20 hover:underline"
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
              className="shrink-0 text-3xs font-medium"
            >
              {workCopy.priorityLabels[task.priority]}
            </Badge>
          </div>

          <ItemTitle className="text-sm font-semibold leading-snug">
            <Link
              href={workHref(params, { taskId: task.id })}
              scroll={false}
              className="line-clamp-2 transition-colors hover:text-primary"
            >
              {cleanTitle}
            </Link>
          </ItemTitle>

          {task.description ? (
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground/80">
              {task.description}
            </p>
          ) : null}

          <ItemDescription className="flex flex-col gap-2 border-t border-border/20 pt-2 text-xs">
            <div className="flex items-center justify-between gap-1.5">
              {task.assigneeId ? (
                <span className="inline-flex max-w-32 items-center gap-1.5 truncate text-xs text-muted-foreground">
                  <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-3xs font-semibold">
                    {(assigneeName ?? task.assigneeId).charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate font-medium">
                    {assigneeName ?? task.assigneeId.slice(0, 8)}
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-2xs italic text-muted-foreground/50">
                  <IconUser className="size-3 shrink-0 opacity-40" />
                  <span>{workCopy.unassigned}</span>
                </span>
              )}

              {task.dueAt ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 font-mono tabular-nums text-2xs px-1.5 py-0.5 rounded",
                    isOverdue
                      ? "font-semibold text-destructive bg-destructive/10"
                      : isDueToday
                        ? "font-semibold text-warning bg-warning/10"
                        : "text-muted-foreground bg-muted/30",
                  )}
                >
                  <IconClock className="size-2.5 shrink-0" />
                  <span>{formatVNDate(task.dueAt)}</span>
                </span>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-1.5 pt-0.5">
              <AppBoardStatusDropdown
                status={task.status}
                statusLabel={
                  workCopy.statusLabels[task.status as WorkTaskStatus] ??
                  task.status
                }
                dotClass={statusBadge.dotClass}
                options={STATUS_OPTIONS.map((statusOption) => ({
                  value: statusOption,
                  label: workCopy.statusLabels[statusOption],
                  dotClass: getStatusBadgeProps(statusOption).dotClass,
                }))}
                onStatusChange={(nextStatus) =>
                  moveTaskStatus(task.id, nextStatus as WorkTaskStatus)
                }
                disabled={isPending}
              />
            </div>
          </ItemDescription>
        </ItemContent>
      </AppBoardCard>
    );
  }

  function renderDepartmentColumn(
    column: BoardColumn,
    columnTasks: WorkTaskRow[],
  ) {
    const isDragOver = dragOverCol === column.id;
    const activeTasks = sortColumnTasks(
      columnTasks.filter((t) => t.status !== "done"),
    );
    const doneTasks = sortColumnTasks(
      columnTasks.filter((t) => t.status === "done"),
    );
    const isDoneExpanded = Boolean(collapsedDone[column.id]);

    return (
      <AppBoardColumn
        key={column.id}
        id={`board-col-${column.id}`}
        className={WORK_KANBAN_COLUMN}
        isDragOver={isDragOver}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDragEnter={() => setDragOverCol(column.id)}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setDragOverCol(null);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragOverCol(null);
          const raw = event.dataTransfer.getData("text/task-id");
          const taskId = Number(raw);
          if (!Number.isFinite(taskId) || column.id <= 0) return;
          moveTaskDepartment(taskId, column.id);
        }}
      >
        <AppBoardColumnHeader
          title={column.name}
          count={activeTasks.length}
        />

        <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
          {activeTasks.length === 0 && doneTasks.length === 0 ? (
            <Frame className="flex flex-1 flex-col items-center justify-center border-dashed border-border/40 bg-transparent p-4 text-center">
              <span className="text-xs text-muted-foreground/60">
                {workCopy.checklistEmpty}
              </span>
            </Frame>
          ) : (
            activeTasks.map(renderCard)
          )}

          <AppBoardCompletedSection
            count={doneTasks.length}
            isExpanded={isDoneExpanded}
            onToggle={() =>
              setCollapsedDone((prev) => ({
                ...prev,
                [column.id]: !prev[column.id],
              }))
            }
            label={workCopy.doneSectionToggle}
          >
            {doneTasks.map(renderCard)}
          </AppBoardCompletedSection>
        </div>

        {!column.isOther && departments.length > 0 ? (
          <WorkCreateDialog
            departments={departments}
            membersByDepartment={membersByDepartment}
            defaultDepartmentId={column.id}
            params={params}
            trigger={
              <AppBoardColumnAction>
                <IconPlus className="size-3.5" />
                <span>{workCopy.addDepartmentTask}</span>
              </AppBoardColumnAction>
            }
          />
        ) : null}
      </AppBoardColumn>
    );
  }

  if (items.filter((task) => task.status !== "canceled").length === 0) {
    return (
      <AppEmptyState mode="no-data" description={workCopy.inboxEmpty} />
    );
  }

  function scrollToColumn(columnId: number) {
    setActiveDeptId(columnId);
    if (typeof document !== "undefined") {
      const element = document.getElementById(`board-col-${columnId}`);
      element?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {columns.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {columns.map((col) => {
            const colTasks = grouped.get(col.id) ?? [];
            const activeCount = colTasks.filter((t) => t.status !== "done").length;
            const isSelected = activeDeptId === col.id;
            return (
              <Button
                key={col.id}
                type="button"
                variant={isSelected ? "secondary" : "outline"}
                size={controlSize}
                onClick={() => scrollToColumn(col.id)}
                className="flex items-center gap-1.5"
              >
                <span>{col.name}</span>
                <Badge
                  variant={isSelected ? "outline" : "secondary"}
                  className="px-1.5 py-0 text-2xs"
                >
                  {activeCount}
                </Badge>
              </Button>
            );
          })}
        </div>
      ) : null}

      <AppBoardGrid>
        {columns.map((col) =>
          renderDepartmentColumn(col, grouped.get(col.id) ?? []),
        )}
      </AppBoardGrid>
    </div>
  );
}
