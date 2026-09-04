"use client";

import { formatISODateParts, getVNDateParts } from "@comtammatu/shared/time";
import type { WorkTaskRow } from "../actions";
import type { ParsedWorkParams } from "../_lib/params";
import { WorkInbox } from "./work-inbox";

export function WorkInboxFiltered({
  tasks,
  params,
  status,
  q,
}: {
  tasks: WorkTaskRow[];
  params: ParsedWorkParams;
  status: string | null;
  q: string | null;
}) {
  let filtered = tasks;
  if (status) {
    filtered = filtered.filter((task) => task.status === status);
  }
  if (q) {
    const needle = q.toLowerCase();
    filtered = filtered.filter((task) =>
      task.title.toLowerCase().includes(needle),
    );
  }
  if (params.filter === "urgent") {
    filtered = filtered.filter((task) => task.priority === "urgent");
  } else if (params.filter === "overdue") {
    const now = Date.now();
    filtered = filtered.filter(
      (task) =>
        task.dueAt != null &&
        new Date(task.dueAt).getTime() < now &&
        task.status !== "done" &&
        task.status !== "canceled",
    );
  } else if (params.filter === "today") {
    const todayStr = formatISODateParts(getVNDateParts(new Date()));
    filtered = filtered.filter((task) => {
      if (!task.dueAt) return false;
      return formatISODateParts(getVNDateParts(new Date(task.dueAt))) === todayStr;
    });
  }
  return <WorkInbox tasks={filtered} params={params} />;
}
