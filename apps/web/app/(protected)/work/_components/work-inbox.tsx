"use client";

import Link from "next/link";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppEmptyState, AppListFrame } from "@/components/surface";
import type { WorkTaskRow } from "../actions";
import { workCopy } from "@lib/messages/work";

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

export function WorkInbox({ tasks }: { tasks: WorkTaskRow[] }) {
  return (
    <AppListFrame contentScroll>
      {tasks.length === 0 ? (
        <AppEmptyState mode="no-data" description={workCopy.inboxEmpty} />
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <Item
              key={task.id}
              variant="outline"
              render={<Link href={`/work/tasks/${task.id}`} />}
            >
              <ItemContent className="gap-1">
                <ItemTitle>{task.title}</ItemTitle>
                <ItemDescription className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusVariant(task.status)}>
                    {workCopy.statusLabels[task.status]}
                  </Badge>
                  {task.dueAt ? (
                    <span>
                      {workCopy.due}: {formatVNDate(task.dueAt)}
                    </span>
                  ) : (
                    <span>{workCopy.noDue}</span>
                  )}
                  <Badge variant={priorityVariant(task.priority)}>
                    {workCopy.priorityLabels[task.priority]}
                  </Badge>
                </ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </div>
      )}
    </AppListFrame>
  );
}
