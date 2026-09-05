"use client";

import Link from "next/link";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppEmptyState } from "@/components/surface";
import { cn } from "@comtammatu/ui";
import {
  CheckSquare as IconCheckSquare,
  ChevronRight as IconChevronRight,
  Clock as IconClock,
  FileText as IconFileText,
} from "lucide-react";
import type { WorkTaskRow } from "../actions";
import { resolveWorkTaskDocumentLink } from "../_lib/document-links";
import { workCopy } from "@lib/messages/work";
import { WORK_LIST_ITEM_INSET } from "../_lib/compose-styles";
import { workHref, type ParsedWorkParams } from "../_lib/params";

function statusVariant(
  status: WorkTaskRow["status"],
): "secondary" | "info" | "warning" | "success" | "destructive" {
  switch (status) {
    case "done":
      return "success";
    case "in_progress":
      return "info";
    case "review":
      return "warning";
    case "canceled":
      return "destructive";
    default:
      return "secondary";
  }
}

function priorityVariant(
  priority: WorkTaskRow["priority"],
): "secondary" | "warning" | "destructive" {
  if (priority === "urgent") return "destructive";
  if (priority === "high") return "warning";
  return "secondary";
}

export function WorkInbox({
  tasks,
  params,
}: {
  tasks: WorkTaskRow[];
  params: ParsedWorkParams;
}) {
  if (tasks.length === 0) {
    return <AppEmptyState mode="no-data" description={workCopy.inboxEmpty} />;
  }

  return (
    <div className={`flex flex-col ${WORK_LIST_ITEM_INSET}`}>
      <div className="flex items-center justify-between pb-1 text-xs text-muted-foreground">
        <span>
          {tasks.length} {workCopy.pageTitle.toLowerCase()}
        </span>
      </div>

      {tasks.map((task) => {
        const docLink = resolveWorkTaskDocumentLink({
          title: task.title,
          description: task.description,
        });
        const isOverdue =
          task.dueAt &&
          new Date(task.dueAt).getTime() < Date.now() &&
          task.status !== "done" &&
          task.status !== "canceled";

        return (
          <Item
            key={task.id}
            variant="outline"
            className="cursor-pointer bg-card p-3 transition-colors hover:bg-muted/30"
            render={
              <Link
                href={workHref(params, { taskId: task.id })}
                scroll={false}
              />
            }
          >
            <ItemContent className="gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <ItemTitle size="heading">{task.title}</ItemTitle>
                {docLink ? (
                  <Badge
                    variant="outline"
                    className="gap-1 border-primary/20 bg-primary/10 text-2xs font-medium text-primary"
                  >
                    <IconFileText className="size-3" />
                    <span>{docLink.label}</span>
                  </Badge>
                ) : null}
              </div>

              <ItemDescription className="flex flex-wrap items-center gap-2">
                <Badge variant={statusVariant(task.status)}>
                  {workCopy.statusLabels[task.status]}
                </Badge>
                <Badge variant={priorityVariant(task.priority)}>
                  {workCopy.priorityLabels[task.priority]}
                </Badge>
                {task.checklistTotal != null && task.checklistTotal > 0 ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 font-mono tabular-nums text-2xs px-1.5 py-0.5 rounded",
                      task.checklistDone === task.checklistTotal
                        ? "font-semibold text-success bg-success/10"
                        : "text-muted-foreground bg-muted/30",
                    )}
                    title={`${task.checklistDone ?? 0}/${task.checklistTotal}`}
                  >
                    <IconCheckSquare className="size-3 shrink-0" />
                    <span>
                      {task.checklistDone ?? 0}/{task.checklistTotal}
                    </span>
                  </span>
                ) : null}
                {task.dueAt ? (
                  <span
                    className={`inline-flex items-center gap-1 text-xs ${
                      isOverdue
                        ? "font-medium text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    <IconClock className="size-3" />
                    <span>
                      {workCopy.due}: {formatVNDate(task.dueAt)}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {workCopy.noDue}
                  </span>
                )}
              </ItemDescription>
            </ItemContent>

            <ItemActions>
              <IconChevronRight className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
            </ItemActions>
          </Item>
        );
      })}
    </div>
  );
}
