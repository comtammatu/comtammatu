import { notFound } from "next/navigation";
import { loadBranchStockIssueDetailData } from "@lib/inventory/branch-stock-issue-data";
import { BranchStockIssueDetailClient } from "../../issues/[id]/branch-stock-issue-detail-client";

interface PageProps {
  params: Promise<{ branchId: string; id: string }>;
}

export default async function OperatorStockConsumptionDetailPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId, id: rawId } = await params;
  const branchId = Number(rawBranchId);
  const issueId = Number(rawId);
  if (
    !Number.isInteger(branchId) ||
    branchId <= 0 ||
    !Number.isInteger(issueId) ||
    issueId <= 0
  ) {
    notFound();
  }

  const data = await loadBranchStockIssueDetailData(
    issueId,
    branchId,
    "consumption",
  );
  const stockBasePath = `/br/${branchId}/stock`;

  return (
    <BranchStockIssueDetailClient
      data={data}
      stockBasePath={stockBasePath}
      listBasePath={`${stockBasePath}/consumption`}
    />
  );
}
