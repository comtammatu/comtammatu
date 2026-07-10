import { notFound } from "next/navigation";
import { BranchStockReportsClient } from "./branch-stock-reports-client";
import { loadBranchStockReportData } from "@lib/inventory/branch-stock-report-data";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorStockReportsPage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const data = await loadBranchStockReportData(branchId);
  return <BranchStockReportsClient {...data} />;
}
