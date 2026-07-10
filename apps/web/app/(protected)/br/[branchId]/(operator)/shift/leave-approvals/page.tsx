import { notFound } from "next/navigation";
import { loadBranchLeaveApprovalData } from "@lib/hr/branch-leave-approval-data";
import { BranchLeaveApprovalsClient } from "./branch-leave-approvals-client";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorLeaveApprovalsPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
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
