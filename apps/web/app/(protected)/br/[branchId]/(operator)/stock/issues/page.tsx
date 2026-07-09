import { notFound } from "next/navigation";
import { IssuesPageContent } from "@/(protected)/inventory/issues/page";

interface PageProps {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{
    endDate?: string | string[];
    startDate?: string | string[];
  }>;
}

export default async function OperatorStockIssuesPage({
  params,
  searchParams,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return (
    <IssuesPageContent
      searchParams={searchParams}
      routeBranchId={branchId}
      scope="internal"
      listBasePath={`/br/${branchId}/stock/issues`}
      embedded
    />
  );
}
