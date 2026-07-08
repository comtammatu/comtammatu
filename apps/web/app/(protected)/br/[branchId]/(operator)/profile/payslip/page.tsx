import { notFound } from "next/navigation";
import { PayslipPageContent } from "@lib/staff-runtime/payslip/page";

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
    <PayslipPageContent
      searchParams={searchParams}
      hideHeaderOnMobile
      profileHref={`/br/${branchId}/profile`}
    />
  );
}
