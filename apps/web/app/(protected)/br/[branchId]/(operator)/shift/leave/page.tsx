import { notFound } from "next/navigation";
import { EmployeeLeavePageContent } from "@/(protected)/employee/leave/page";

export default async function OperatorShiftLeavePage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return (
    <EmployeeLeavePageContent
      profileHref={`/br/${branchId}/shift/profile`}
      routeBranchId={branchId}
      hideHeaderOnMobile
    />
  );
}
