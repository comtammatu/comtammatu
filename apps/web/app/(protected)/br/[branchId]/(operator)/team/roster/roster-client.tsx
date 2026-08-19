"use client";

import Link from "next/link";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { messages } from "@lib/messages";
import {
  BranchOperatorControlBar,
  BranchOperatorPage,
} from "@lib/branch-operator/components/branch-operator-page";
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
      hideHeaderOnMobile
    >
      <BranchOperatorControlBar className="sm:hidden">
        <Button
          variant="ghost"
          size="icon-touch"
          render={
            <Link
              href={`/br/${branchId}/team`}
              aria-label={copy.backToTeamAria}
            />
          }
        >
          <IconArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{copy.title}</p>
          <p className="truncate text-xs text-muted-foreground">{branchName}</p>
        </div>
      </BranchOperatorControlBar>
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
