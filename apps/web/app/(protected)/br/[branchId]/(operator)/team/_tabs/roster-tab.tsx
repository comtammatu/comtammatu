import { notFound } from "next/navigation";
import { loadBranchRosterData } from "@lib/hr/roster/load-branch-roster-data";
import { BranchRosterClient } from "../../shift/roster/roster-client";

interface TabProps {
  branchId: number;
  week?: string;
}

/**
 * Roster tab inside the Team hub. Mirrors the legacy
 * `/br/{branchId}/shift/roster` presentation (R1–R6: no nested AppPage, branch
 * back-links) but is mounted under `/br/{branchId}/team?tab=roster`.
 */
export async function RosterTab({ branchId, week }: TabProps) {
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();
  const data = await loadBranchRosterData(branchId, week);
  return (
    <BranchRosterClient
      branchId={data.branchId}
      branchName={data.branchName}
      weekStart={data.weekStart}
      roster={data.roster}
      canAssign={data.canAssign}
      loadFailed={data.loadFailed}
    />
  );
}
