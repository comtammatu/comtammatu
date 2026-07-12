import { notFound } from "next/navigation";
import { BranchStocktakeCountClient } from "./branch-stocktake-count-client";
import { loadBranchStocktakeCountData } from "@lib/inventory/branch-stocktake-data";

interface PageProps {
  params: Promise<{ branchId: string; id: string }>;
}

export default async function OperatorStocktakeCountPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId, id: rawId } = await params;
  const branchId = Number(rawBranchId);
  const stocktakeId = Number(rawId);
  if (
    !Number.isInteger(branchId) ||
    branchId <= 0 ||
    !Number.isInteger(stocktakeId) ||
    stocktakeId <= 0
  ) {
    notFound();
  }

  const data = await loadBranchStocktakeCountData(stocktakeId, branchId);
  return <BranchStocktakeCountClient data={data} />;
}
