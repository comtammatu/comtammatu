import { notFound } from "next/navigation";
import { CountSlipsPageContent } from "@/(protected)/inventory/count-slips/page";
import { BranchOpsRefresh } from "../../branch-ops-refresh";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorCountSlipsPage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return (
    <>
      <BranchOpsRefresh branchId={branchId} />
      <CountSlipsPageContent
        routeBranchId={branchId}
        embedded
        basePath={`/br/${branchId}/stock/count-slips`}
      />
    </>
  );
}
