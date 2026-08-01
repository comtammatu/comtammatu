import { StaffSchedulePageContent } from "@lib/staff-runtime/schedule/page";

export default function SelfServiceSchedulePage() {
  return (
    <StaffSchedulePageContent
      leaveHref="/me/schedule/leave"
      profileHref="/me/profile"
    />
  );
}
