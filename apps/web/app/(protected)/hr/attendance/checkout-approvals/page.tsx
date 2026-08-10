import { StaffCheckoutApprovalsPageContent } from "@lib/staff-runtime/checkout-approvals/page";

export default function CheckoutApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ attendanceId?: string }>;
}) {
  return searchParams.then(({ attendanceId }) => {
    const parsedAttendanceId = Number(attendanceId);
    return (
      <StaffCheckoutApprovalsPageContent
        routeBranchId={null}
        ownerHomeHref="/hr/attendance"
        focusAttendanceId={
          Number.isInteger(parsedAttendanceId) && parsedAttendanceId > 0
            ? parsedAttendanceId
            : undefined
        }
      />
    );
  });
}
