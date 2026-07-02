import { notFound } from "next/navigation";
import { IssuesPageContent } from "@/(protected)/inventory/issues/page";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorStockConsumptionPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return (
    <IssuesPageContent
      routeBranchId={branchId}
      scope="consumption"
      consumptionBasePath={`/br/${branchId}/stock/consumption`}
      embedded
    />
  );
}
