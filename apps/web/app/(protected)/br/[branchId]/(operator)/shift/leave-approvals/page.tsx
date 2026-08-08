import { notFound } from "next/navigation";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";
import { LeavesTab } from "../../team/_tabs/leaves-tab";

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
  return <LeavesTab branchId={branchId} />;
}
