import { notFound } from "next/navigation";
import { BranchStockReportsClient } from "./branch-stock-reports-client";
import { loadBranchStockReportData } from "@lib/inventory/branch-stock-report-data";

interface PageProps {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ location?: string | string[] }>;
}

export default async function OperatorStockReportsPage({
  params,
  searchParams,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const { location: rawLocation } = await searchParams;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();
  const locationValue = Array.isArray(rawLocation)
    ? rawLocation[0]
    : rawLocation;
  const locationId = locationValue == null ? null : Number(locationValue);
  if (
    locationId != null &&
    (!Number.isInteger(locationId) || locationId <= 0)
  ) {
    notFound();
  }

  const data = await loadBranchStockReportData(branchId, locationId);
  return <BranchStockReportsClient {...data} />;
}
