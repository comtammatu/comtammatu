import { notFound, redirect } from "next/navigation";
import { BranchStocktakeNewClient } from "./branch-stocktake-new-client";
import { loadBranchStocktakeStartData } from "@lib/inventory/branch-stocktake-data";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorNewStocktakePage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const data = await loadBranchStocktakeStartData(branchId);
  if (!data.featureEnabled) {
    redirect(
      `/br/${branchId}/stock/stocktake?error=stocktake_redesigned_not_enabled`,
    );
  }
  return <BranchStocktakeNewClient {...data} />;
}
