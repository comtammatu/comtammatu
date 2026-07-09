import { notFound } from "next/navigation";
import { StaffCheckoutApprovalsPageContent } from "@lib/staff-runtime/checkout-approvals/page";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorCheckoutApprovalsPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return (
    <StaffCheckoutApprovalsPageContent
      routeBranchId={branchId}
      hideHeaderOnMobile
      plane="branch"
    />
  );
}
