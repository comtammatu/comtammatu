import { notFound } from "next/navigation";
import { StaffPayslipPageContent } from "@lib/staff-runtime/payslip/page";

export default async function OperatorProfilePayslipPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return (
    <StaffPayslipPageContent
      searchParams={searchParams}
      profileHref={`/br/${branchId}/profile`}
      plane="branch"
    />
  );
}
