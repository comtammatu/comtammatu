import { notFound } from "next/navigation";
import { loadBranchLeaveApprovalData } from "@lib/hr/branch-leave-approval-data";
import { BranchLeaveApprovalsClient } from "../../shift/leave-approvals/branch-leave-approvals-client";

interface TabProps {
  branchId: number;
}

/**
 * Leave approvals body shared by `/br/{branchId}/shift/leave-approvals`.
 */
export async function LeavesTab({ branchId }: TabProps) {
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();
  const data = await loadBranchLeaveApprovalData(branchId);
  return (
    <BranchLeaveApprovalsClient
      branchId={data.branchId}
      branchName={data.branchName}
      canApprove={data.canApprove}
      initialRows={data.rows}
      loadFailed={data.loadFailed}
    />
  );
}
