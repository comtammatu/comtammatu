import { notFound } from "next/navigation";
import { BranchStockIssuesListClient } from "./branch-stock-issues-list-client";
import { loadBranchStockIssueListData } from "@lib/inventory/branch-stock-issue-data";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorStockIssuesPage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const data = await loadBranchStockIssueListData(branchId);
  return <BranchStockIssuesListClient {...data} />;
}
