import { notFound } from "next/navigation";
import { loadStockOnHandPageData } from "@lib/inventory/stock-on-hand-data";
import { parseOperatorBranchId } from "../../_lib/parse-branch-id";
import { BranchStockOnHandClient } from "./on-hand/branch-stock-on-hand-client";

export default async function OperatorStockPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
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
      canCreateGrn={data.permissions.canReceiveGrn}
      canCreateStocktake={data.permissions.canCreateStocktake}
      canWriteoff={data.permissions.canWriteoff}
      underThresholdCount={data.summary.underThresholdCount}
    />
  );
}
