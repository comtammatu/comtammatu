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
        // Branch home is where POS/KDS tiles unlock after clock-in, so clock-out
        // and a successful floor-role clock-in both return there.
        home: `/br/${branchId}`,
        tasks: `/br/${branchId}/shift`,
        schedule: `/br/${branchId}/shift/schedule`,
        profile: `/br/${branchId}/profile`,
        managerHr: `/br/${branchId}/team`,
      }}
      plane="branch"
    />
  );
}
