import { notFound } from "next/navigation";
import { EmployeeLeavePageContent } from "@lib/employee/leave/page";

export default async function OperatorShiftScheduleLeavePage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return (
    <EmployeeLeavePageContent
      returnHref={`/br/${branchId}/shift/schedule`}
      routeBranchId={branchId}
      profileHref={`/br/${branchId}/profile`}
      hideHeaderOnMobile
    />
  );
}
