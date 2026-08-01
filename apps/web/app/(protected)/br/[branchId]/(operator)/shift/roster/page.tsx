import { notFound } from "next/navigation";
import { loadBranchRosterData } from "@lib/hr/roster/load-branch-roster-data";
import { BranchRosterClient } from "./roster-client";

interface PageProps {
  params: Promise<{ branchId: string }>;
  searchParams?: Promise<{ week?: string }>;
}

export default async function OperatorShiftRosterPage({
  params,
  searchParams,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const data = await loadBranchRosterData(branchId, resolvedSearchParams.week);

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
