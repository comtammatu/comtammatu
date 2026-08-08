import { notFound } from "next/navigation";
import { StaffCheckoutApprovalsPageContent } from "@lib/staff-runtime/checkout-approvals/page";

interface TabProps {
  branchId: number;
  /** Forwarded `?attendanceId=` deep-link focus from legacy redirect shim. */
  attendanceId?: number;
}

/**
 * Checkout approvals body. Prefer the full `/shift/checkout-approvals` route;
 * kept for any remaining embedded callers.
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
