import { notFound } from "next/navigation";
import { loadBranchAttendanceData } from "@lib/hr/branch-attendance-data";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";
import { BranchAttendanceClient } from "./branch-attendance-client";

/**
 * Full-page branch attendance for branch managers.
 */
export default async function BranchAttendancePage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();
  const data = await loadBranchAttendanceData(branchId);
  return (
    <BranchAttendanceClient
      branchId={data.branchId}
      branchName={data.branchName}
      canView={data.canView}
      canForceClose={data.canForceClose}
      today={data.today}
      month={data.month}
      initialRecords={data.records}
      loadFailed={data.loadFailed}
    />
  );
}
