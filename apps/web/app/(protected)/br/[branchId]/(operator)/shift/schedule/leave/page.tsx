import { notFound } from "next/navigation";
import { EmployeeLeavePageContent } from "@lib/staff-runtime/leave/page";

export default async function OperatorShiftScheduleLeavePage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const { branchId: rawBranchId } = await params;
  const { date: rawDate } = await searchParams;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();
  const initialDate = Array.isArray(rawDate) ? rawDate[0] : rawDate;

  return (
    <EmployeeLeavePageContent
      returnHref={`/br/${branchId}/shift/schedule`}
      routeBranchId={branchId}
      profileHref={`/br/${branchId}/profile`}
      initialDate={initialDate}
      plane="branch"
    />
  );
}
