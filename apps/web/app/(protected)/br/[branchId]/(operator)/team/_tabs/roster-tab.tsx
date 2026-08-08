import { notFound } from "next/navigation";
import { loadBranchRosterData } from "@lib/hr/roster/load-branch-roster-data";
import { BranchRosterClient } from "../../shift/roster/roster-client";

interface TabProps {
  branchId: number;
  week?: string;
}

/**
 * Branch roster body shared by `/br/{branchId}/shift/roster`.
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
