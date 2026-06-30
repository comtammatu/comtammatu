import { ClockPageContent } from "@/(protected)/employee/clock/page";

export default async function OperatorShiftClockPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;

  return (
    <ClockPageContent
      routes={{
        home: `/br/${branchId}`,
        tasks: `/br/${branchId}/shift/tasks`,
        schedule: `/br/${branchId}/shift/schedule`,
        managerHr: "/hr",
      }}
    />
  );
}
