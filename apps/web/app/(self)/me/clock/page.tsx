import { StaffClockPageContent } from "@lib/staff-runtime/clock/page";

export default function SelfServiceClockPage() {
  return (
    <StaffClockPageContent
      routes={{
        home: "/me",
        tasks: "/me",
        schedule: "/me/schedule",
        profile: "/me/profile",
        managerHr: "/me",
      }}
    />
  );
}
