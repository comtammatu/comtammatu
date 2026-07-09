import { StaffClockPageContent } from "@lib/staff-runtime/clock/page";

export default async function OperatorShiftClockPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;

  return (
    <StaffClockPageContent
      routes={{
        home: `/br/${branchId}/shift`,
        tasks: `/br/${branchId}/shift`,
        schedule: `/br/${branchId}/shift/schedule`,
        profile: `/br/${branchId}/profile`,
        managerHr: `/br/${branchId}/team`,
      }}
      plane="branch"
    />
  );
}
