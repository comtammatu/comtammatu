import { EmployeeTasksPageContent } from "@/(protected)/employee/tasks/page";

export default async function OperatorShiftTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ location?: string }>;
}) {
  const { branchId } = await params;
  const numericBranchId = Number(branchId);

  return (
    <EmployeeTasksPageContent
      clockHref={`/br/${branchId}/shift/clock`}
      countHref={`/br/${branchId}/stock/count`}
      countBaseHref={`/br/${branchId}/shift/tasks`}
      routeBranchId={
        Number.isInteger(numericBranchId) && numericBranchId > 0
          ? numericBranchId
          : undefined
      }
      searchParams={searchParams}
    />
  );
}
