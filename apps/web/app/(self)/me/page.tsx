import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { StaffWorkdayPageContent } from "@lib/staff-runtime/page";

export default async function SelfServicePage() {
  const authState = await loadAuthState();
  return (
    <StaffWorkdayPageContent
      authState={authState}
      routes={{
        clock: "/me/clock",
        tasks: "/me",
        schedule: "/me/schedule",
        profile: "/me/profile",
        checkoutApprovals: "/me",
        count: "/me",
        wasteApprovals: "/me",
      }}
      enableBranchOpsRefresh={false}
      showNotificationControl={false}
      mode="full"
      plane="employee"
      copy={messages.operator.shift}
      tasksCopy={messages.operator.shiftTasks}
    />
  );
}
