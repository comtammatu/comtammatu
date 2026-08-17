import { EmployeeLeavePageContent } from "@lib/staff-runtime/leave/page";

export default function SelfServiceLeavePage() {
  return (
    <EmployeeLeavePageContent
      returnHref="/me/schedule"
      profileHref="/me/profile"
    />
  );
}
