import { notFound } from "next/navigation";
import { loadBranchRosterData } from "@lib/hr/roster/load-branch-roster-data";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";
import { BranchRosterClient } from "./roster-client";

/**
 * Full-page branch roster. Nested under `/team/roster` so the week grid
 * keeps the Team tab highlighted on small phones.
 */
export default async function OperatorShiftRosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams?: Promise<{ week?: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();
  const { week } = searchParams ? await searchParams : {};
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
