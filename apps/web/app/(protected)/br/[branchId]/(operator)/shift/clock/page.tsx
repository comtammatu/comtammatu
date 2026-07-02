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
        home: `/br/${branchId}/shift`,
        tasks: `/br/${branchId}/shift`,
        schedule: `/br/${branchId}/shift/schedule`,
        managerHr: "/hr",
      }}
    />
  );
}
