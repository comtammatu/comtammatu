import { notFound } from "next/navigation";
import { StaffSchedulePageContent } from "@lib/staff-runtime/schedule/page";

export default async function OperatorShiftSchedulePage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return (
    <StaffSchedulePageContent
      leaveHref={`/br/${branchId}/shift/schedule/leave`}
      profileHref={`/br/${branchId}/profile`}
      plane="branch"
      routeBranchId={branchId}
    />
  );
}
