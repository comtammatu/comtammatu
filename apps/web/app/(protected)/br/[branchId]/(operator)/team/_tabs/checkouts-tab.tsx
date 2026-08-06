import { notFound } from "next/navigation";
import { StaffCheckoutApprovalsPageContent } from "@lib/staff-runtime/checkout-approvals/page";

interface TabProps {
  branchId: number;
  /** Forwarded `?attendanceId=` deep-link focus from legacy redirect shim. */
  attendanceId?: number;
}

/**
 * Checkout approvals tab inside the Team hub. Re-mounts the shared
 * `StaffCheckoutApprovalsPageContent` with `embedded` so it renders without
 * its own page shell (R1–R6).
 */
export async function CheckoutsTab({ branchId, attendanceId }: TabProps) {
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();
  return (
    <StaffCheckoutApprovalsPageContent
      routeBranchId={branchId}
      focusAttendanceId={
        Number.isInteger(attendanceId) && (attendanceId ?? 0) > 0
          ? attendanceId
          : undefined
      }
      plane="branch"
      embedded
    />
  );
}
