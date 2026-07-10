import { notFound } from "next/navigation";
import { loadBranchWasteCreateData } from "@lib/inventory/branch-waste-create-data";
import { BranchWasteCreateClient } from "./branch-waste-create-client";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorStockWastePage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const data = await loadBranchWasteCreateData(branchId);
  return <BranchWasteCreateClient {...data} />;
}
