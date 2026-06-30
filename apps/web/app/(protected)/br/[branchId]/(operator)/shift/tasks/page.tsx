import { EmployeeTasksPageContent } from "@/(protected)/employee/tasks/page";

export default async function OperatorShiftTasksPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;

  return (
    <EmployeeTasksPageContent
      clockHref={`/br/${branchId}/shift/clock`}
      countHref={`/br/${branchId}/stock/count`}
    />
  );
}
