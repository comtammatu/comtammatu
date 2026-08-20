"use client";

import { messages } from "@lib/messages";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import type { RosterWeekData } from "@lib/hr/roster/roster-model";
import { BranchRosterWeekClient } from "./branch-roster-week-client";

const copy = messages.hr.roster;

export function BranchRosterClient({
  branchId,
  branchName,
  weekStart,
  roster,
  canAssign,
  loadFailed,
}: {
  branchId: number;
  branchName: string;
  weekStart: string;
  roster: RosterWeekData;
  canAssign: boolean;
  loadFailed: boolean;
}) {
  return (
    <BranchOperatorPage
      title={copy.title}
      description={`${branchName} · ${copy.description}`}
    >
      <BranchRosterWeekClient
        branchId={branchId}
        weekStart={weekStart}
        data={roster}
        canAssign={canAssign}
        loadFailed={loadFailed}
      />
    </BranchOperatorPage>
  );
}
