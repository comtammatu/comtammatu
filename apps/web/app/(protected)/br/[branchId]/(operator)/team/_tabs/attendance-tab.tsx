import { notFound } from "next/navigation";
import { loadBranchAttendanceData } from "@lib/hr/branch-attendance-data";
import { BranchAttendanceClient } from "../../shift/attendance/branch-attendance-client";

interface TabProps {
  branchId: number;
}

/**
 * Branch attendance body shared by `/br/{branchId}/shift/attendance`.
 */
export async function AttendanceTab({ branchId }: TabProps) {
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();
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
