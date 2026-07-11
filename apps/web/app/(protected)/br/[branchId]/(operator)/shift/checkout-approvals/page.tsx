import { notFound } from "next/navigation";
import { StaffCheckoutApprovalsPageContent } from "@lib/staff-runtime/checkout-approvals/page";

interface PageProps {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ attendanceId?: string | string[] }>;
}

export default async function OperatorCheckoutApprovalsPage({
  params,
  searchParams,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const { attendanceId: rawAttendanceId } = await searchParams;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();
  const attendanceId = Number(
    Array.isArray(rawAttendanceId) ? rawAttendanceId[0] : rawAttendanceId,
  );

  return (
    <StaffCheckoutApprovalsPageContent
      routeBranchId={branchId}
      focusAttendanceId={
        Number.isInteger(attendanceId) && attendanceId > 0
          ? attendanceId
          : undefined
      }
      plane="branch"
    />
  );
}
