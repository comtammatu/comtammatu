"use client";

import type { WorkTaskRow } from "../actions";
import { WorkInbox } from "./work-inbox";

export function WorkInboxFiltered({
  tasks,
  status,
  q,
}: {
  tasks: WorkTaskRow[];
  status: string | null;
  q: string | null;
}) {
  // MVP: filter after list_my_work_tasks RPC — URL remains the filter SSOT.
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
  return <WorkInbox tasks={filtered} />;
}
