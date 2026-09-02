import { notFound } from "next/navigation";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { BranchWasteApprovalsClient } from "./branch-waste-approvals-client";
import { loadBranchWasteApprovalsData } from "@lib/inventory/waste-approvals-data";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorWasteApprovalsPage({
  params,
}: PageProps) {
  const { branchId: branchIdParam } = await params;
  const branchId = Number(branchIdParam);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const data = await loadBranchWasteApprovalsData(branchId);
  return (
    <BranchWasteApprovalsClient
      branchId={branchId}
      branchName={data.branchName ?? UNKNOWN_LABEL_VI}
      canApproveWaste={data.canApproveWaste}
      loadFailed={data.loadFailed}
      initial={data.rows}
    />
  );
}
