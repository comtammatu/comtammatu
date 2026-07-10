import { notFound } from "next/navigation";
import { loadBranchConsumptionListData } from "@lib/inventory/branch-consumption-data";
import { BranchConsumptionListClient } from "./branch-consumption-list-client";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorStockConsumptionPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const data = await loadBranchConsumptionListData(branchId);

  return <BranchConsumptionListClient {...data} />;
}
