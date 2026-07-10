import { notFound } from "next/navigation";
import { BranchStocktakeListClient } from "./branch-stocktake-list-client";
import { loadBranchStocktakeListData } from "@lib/inventory/branch-stocktake-data";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorStocktakePage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const data = await loadBranchStocktakeListData(branchId);
  return <BranchStocktakeListClient {...data} />;
}
