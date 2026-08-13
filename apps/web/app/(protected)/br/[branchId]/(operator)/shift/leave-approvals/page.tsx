import { notFound } from "next/navigation";
import { loadBranchLeaveApprovalData } from "@lib/hr/branch-leave-approval-data";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";
import { BranchLeaveApprovalsClient } from "./branch-leave-approvals-client";

/**
 * Full-page leave approval queue for branch managers.
 */
export default async function OperatorLeaveApprovalsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();
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
