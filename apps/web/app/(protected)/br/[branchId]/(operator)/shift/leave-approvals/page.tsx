import { notFound } from "next/navigation";
import { LeaveApprovalsPageContent } from "@/(protected)/hr/leave-approvals-page-content";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorLeaveApprovalsPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return <LeaveApprovalsPageContent routeBranchId={branchId} hideHeaderOnMobile />;
}
