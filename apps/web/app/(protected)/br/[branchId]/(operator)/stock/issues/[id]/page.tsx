import { notFound } from "next/navigation";
import { IssueDetailPageContent } from "@/(protected)/inventory/issues/[id]/page";

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

  return (
    <IssueDetailPageContent
      issueId={issueId}
      routeBranchId={branchId}
      listBasePath={`/br/${branchId}/stock/issues`}
      embedded
    />
  );
}
