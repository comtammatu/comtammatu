import { notFound, redirect } from "next/navigation";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";

/** Class C: old bookmarks and notification URLs land on `/team/leave-approvals`. */
export default async function OperatorShiftLeaveApprovalsShimPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams?: Promise<{ leaveRequestId?: string | string[] }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();
  const { leaveRequestId: rawLeaveRequestId } = searchParams
    ? await searchParams
    : {};
  const leaveRequestId = Array.isArray(rawLeaveRequestId)
    ? rawLeaveRequestId[0]
    : rawLeaveRequestId;
  const query = leaveRequestId
    ? `?leaveRequestId=${encodeURIComponent(leaveRequestId)}`
    : "";
  redirect(`/br/${branchId}/team/leave-approvals${query}`);
}
