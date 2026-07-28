import { notFound } from "next/navigation";
import { loadStockOnHandPageData } from "@lib/inventory/stock-on-hand-data";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";
import { BranchStockOnHandClient } from "./branch-stock-on-hand-client";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorStockOnHandPage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const data = await loadStockOnHandPageData({
    routeBranchId: branchId,
    includeValuation: false,
  });

  return (
    <BranchStockOnHandClient
      branchId={data.branchId}
      coreDataLoadFailed={data.coreDataLoadFailed}
      ingredients={data.ingredients}
      canCreateStockRequest={data.permissions.canCreateStockRequest}
      underThresholdCount={data.summary.underThresholdCount}
    />
  );
}
