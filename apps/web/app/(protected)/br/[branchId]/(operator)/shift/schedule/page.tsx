import { SchedulePageContent } from "@/(protected)/employee/schedule/page";

export default async function OperatorShiftSchedulePage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;

  return (
    <SchedulePageContent leaveHref={`/br/${branchId}/shift/schedule/leave`} />
  );
}
