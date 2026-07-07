import { notFound } from "next/navigation";
import { WasteApprovalsPageContent } from "@/(protected)/inventory/waste/approvals/page";
import { BranchOpsRefresh } from "../../branch-ops-refresh";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorWasteApprovalsPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return (
    <>
      <BranchOpsRefresh branchId={branchId} />
      <WasteApprovalsPageContent routeBranchId={branchId} embedded />
    </>
  );
}
