import { notFound } from "next/navigation";
import { BranchStockIssueDetailClient } from "./branch-stock-issue-detail-client";
import { loadBranchStockIssueDetailData } from "@lib/inventory/branch-stock-issue-data";

interface PageProps {
  params: Promise<{ branchId: string; id: string }>;
}

export default async function OperatorStockIssueDetailPage({
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

  const data = await loadBranchStockIssueDetailData(issueId, branchId);
  return (
    <BranchStockIssueDetailClient
      data={data}
      stockBasePath={`/br/${branchId}/stock`}
    />
  );
}
