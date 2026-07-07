import { notFound } from "next/navigation";
import { CountAssignmentsPageContent } from "@/(protected)/inventory/count-assignments/page";
import { BranchOpsRefresh } from "../../branch-ops-refresh";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorCountAssignmentsPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return (
    <>
      <BranchOpsRefresh branchId={branchId} />
      <CountAssignmentsPageContent
        routeBranchId={branchId}
        basePath={`/br/${branchId}/stock/count-assignments`}
        embedded
      />
    </>
  );
}
