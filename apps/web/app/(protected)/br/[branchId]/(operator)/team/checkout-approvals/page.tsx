import { notFound } from "next/navigation";
import { StaffCheckoutApprovalsPageContent } from "@lib/staff-runtime/checkout-approvals/page";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";

/**
 * Full-page checkout approval queue for branch managers.
 */
export default async function OperatorCheckoutApprovalsPage({
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
  const focusAttendanceId = Number(attendanceId);

  return (
    <StaffCheckoutApprovalsPageContent
      routeBranchId={branchId}
      focusAttendanceId={
        Number.isInteger(focusAttendanceId) && focusAttendanceId > 0
          ? focusAttendanceId
          : undefined
      }
      plane="branch"
      hideHeaderOnMobile
    />
  );
}
