import { notFound, redirect } from "next/navigation";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";

/** Class C: old bookmarks and notification URLs land on `/team/checkout-approvals`. */
export default async function OperatorShiftCheckoutApprovalsShimPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ attendanceId?: string | string[] }>;
}) {
  const { branchId: rawBranchId } = await params;
  const { attendanceId: rawAttendanceId } = await searchParams;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();
  const attendanceId = Array.isArray(rawAttendanceId)
    ? rawAttendanceId[0]
    : rawAttendanceId;
  const query = attendanceId
    ? `?attendanceId=${encodeURIComponent(attendanceId)}`
    : "";
  redirect(`/br/${branchId}/team/checkout-approvals${query}`);
}
