import { notFound } from "next/navigation";
import { loadBranchCountAssignmentData } from "@lib/inventory/branch-count-assignment-data";
import { BranchCountAssignmentsClient } from "./branch-count-assignments-client";

interface PageProps {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{
    locationId?: string | string[];
    shiftId?: string | string[];
  }>;
}

export default async function OperatorCountAssignmentsPage({
  params,
  searchParams,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const query = await searchParams;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const data = await loadBranchCountAssignmentData({
    routeBranchId: branchId,
    locationParam: query.locationId,
    shiftParam: query.shiftId,
  });

  return <BranchCountAssignmentsClient data={data} />;
}
