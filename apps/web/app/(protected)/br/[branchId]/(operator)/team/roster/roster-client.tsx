"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type MouseEvent } from "react";
import {
  ClipboardCheck as IconClipboardCheck,
  TimerReset as IconTimerReset,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@/components/confirm-dialog";
import { AppBackLink } from "@/components/surface";
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
  const router = useRouter();
  const [rosterDirty, setRosterDirty] = useState(false);
  const teamHref = `/br/${branchId}/team`;

  async function handleNavigation(
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
  ) {
    if (!rosterDirty) return;
    event.preventDefault();
    const approved = await confirm({
      title: copy.unsavedExitTitle,
      description: copy.unsavedExitDescription,
      confirmText: copy.discardChanges,
      cancelText: copy.continueEditing,
      variant: "destructive",
    });
    if (approved) router.push(href);
  }

  return (
    <BranchOperatorPage
      title={copy.title}
      description={`${branchName} · ${copy.description}`}
      back={
        <AppBackLink
          href={teamHref}
          onClick={(event) => void handleNavigation(event, teamHref)}
        />
      }
    >
      <BranchRosterWeekClient
        branchId={branchId}
        weekStart={weekStart}
        data={roster}
        canAssign={canAssign}
        loadFailed={loadFailed}
        onDirtyChange={setRosterDirty}
        relatedActions={
          <>
            <Button
              render={
                <Link
                  href={`/br/${branchId}/team/attendance`}
                  onClick={(event) =>
                    void handleNavigation(
                      event,
                      `/br/${branchId}/team/attendance`,
                    )
                  }
                />
              }
              variant="outline"
              size="touch"
              className="min-w-0 px-1.5 text-xs sm:w-auto sm:px-3 sm:text-sm"
            >
              <IconTimerReset className="size-3.5 sm:size-4" />
              {copy.attendanceAction}
            </Button>
            <Button
              render={
                <Link
                  href={`/br/${branchId}/team/checkout-approvals`}
                  onClick={(event) =>
                    void handleNavigation(
                      event,
                      `/br/${branchId}/team/checkout-approvals`,
                    )
                  }
                />
              }
              variant="outline"
              size="touch"
              className="min-w-0 px-1.5 text-xs sm:w-auto sm:px-3 sm:text-sm"
            >
              <IconClipboardCheck className="size-3.5 sm:size-4" />
              {copy.checkoutApprovalsAction}
            </Button>
          </>
        }
      />
    </BranchOperatorPage>
  );
}
