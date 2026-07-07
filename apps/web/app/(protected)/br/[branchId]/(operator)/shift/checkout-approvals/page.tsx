import { notFound } from "next/navigation";
import { CheckoutApprovalsPageContent } from "@lib/employee/checkout-approvals/page";
import { BranchOpsRefresh } from "../../branch-ops-refresh";

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
    <>
      <BranchOpsRefresh branchId={branchId} />
      <CheckoutApprovalsPageContent
        routeBranchId={branchId}
        hideHeaderOnMobile
      />
    </>
  );
}
