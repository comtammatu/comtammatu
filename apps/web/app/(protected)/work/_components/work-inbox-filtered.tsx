"use client";

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
  return <WorkInbox tasks={filtered} params={params} />;
}
