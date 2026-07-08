import { loadAuthState } from "@/_lib/auth";
import { EmployeeHomePageContent } from "@lib/staff-runtime/page";

export default async function OperatorShiftPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;
  const authState = await loadAuthState();
  const isBranchManager = authState.claims.user_role === "branch_manager";

  return (
    <EmployeeHomePageContent
      authState={authState}
      routes={{
        clock: `/br/${branchId}/shift/clock`,
        tasks: `/br/${branchId}/shift`,
        schedule: `/br/${branchId}/shift/schedule`,
        profile: `/br/${branchId}/profile`,
        checkoutApprovals: `/br/${branchId}/shift/checkout-approvals`,
        count: `/br/${branchId}/stock/count`,
        wasteApprovals: `/br/${branchId}/stock/waste-approvals`,
        leaveApprovals: `/br/${branchId}/shift/leave-approvals`,
        countSlips: `/br/${branchId}/stock/count-slips`,
        countAssignments: `/br/${branchId}/stock/count-assignments`,
        team: `/br/${branchId}/team`,
        hr: "/" + "hr",
      }}
      showNotificationControl={false}
      mode={isBranchManager ? "manager-dashboard" : "full"}
    />
  );
}
