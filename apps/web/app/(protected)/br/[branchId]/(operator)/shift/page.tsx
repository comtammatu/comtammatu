import { EmployeeHomePageContent } from "@/(protected)/employee/page";

export default async function OperatorShiftPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;

  return (
    <EmployeeHomePageContent
      routes={{
        clock: `/br/${branchId}/shift/clock`,
        tasks: `/br/${branchId}/shift/tasks`,
        schedule: `/br/${branchId}/shift/schedule`,
        profile: `/br/${branchId}/shift/profile`,
        leave: `/br/${branchId}/shift/leave`,
        payslip: `/br/${branchId}/shift/payslip`,
        checkoutApprovals: `/br/${branchId}/shift/checkout-approvals`,
        count: `/br/${branchId}/stock/count`,
      }}
      showNotificationControl={false}
      showPersonalActions
    />
  );
}
