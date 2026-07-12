import { notFound } from "next/navigation";
import { getSafeInternalReturnTo } from "@comtammatu/shared/auth";
import { BranchStockIssueDetailClient } from "./branch-stock-issue-detail-client";
import { loadBranchStockIssueDetailData } from "@lib/inventory/branch-stock-issue-data";

interface PageProps {
  params: Promise<{ branchId: string; id: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}

export default async function OperatorStockIssueDetailPage({
  params,
  searchParams,
}: PageProps) {
  const [{ branchId: rawBranchId, id: rawId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
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
  const stockBasePath = `/br/${branchId}/stock`;
  const issuesBasePath = `${stockBasePath}/issues`;
  const rawReturnTo = Array.isArray(query.returnTo)
    ? query.returnTo[0]
    : query.returnTo;
  const safeReturnTo = getSafeInternalReturnTo(rawReturnTo);
  const listBasePath =
    safeReturnTo === issuesBasePath ||
    safeReturnTo?.startsWith(`${issuesBasePath}?`)
      ? safeReturnTo
      : issuesBasePath;
  return (
    <BranchStockIssueDetailClient
      data={data}
      stockBasePath={stockBasePath}
      listBasePath={listBasePath}
    />
  );
}
