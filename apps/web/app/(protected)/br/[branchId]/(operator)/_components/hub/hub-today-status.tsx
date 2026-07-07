import { EmployeeHomePageContent } from "@lib/employee/page";
import { getTodayWorkState } from "@lib/employee/_lib/today-work-state";
import { loadAuthState } from "@/_lib/auth";

export async function HubTodayStatus({
  branchId,
}: {
  branchId: number;
}) {
  const authState = await loadAuthState();
  
  // Notice we can await getTodayWorkState here instead of at the page level
  await getTodayWorkState();
  
  const basePath = `/br/${branchId}`;

  return (
    <EmployeeHomePageContent
      authState={authState}
      mode="compact-status"
      routes={{
        clock: `${basePath}/shift/clock`,
        tasks: `${basePath}/shift`,
        schedule: `${basePath}/shift/schedule`,
        profile: `${basePath}/profile`,
        checkoutApprovals: `${basePath}/shift/checkout-approvals`,
        count: `${basePath}/stock/count`,
        wasteApprovals: `${basePath}/stock/waste-approvals`,
      }}
      showNotificationControl={false}
    />
  );
}
