import { notFound } from "next/navigation";
import { loadBranchCountSlipData } from "@lib/inventory/branch-count-slip-data";
import { BranchCountSlipsClient } from "./branch-count-slips-client";

interface PageProps {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ employeeId?: string | string[] }>;
}

export default async function OperatorCountSlipsPage({
  params,
  searchParams,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const { employeeId: rawEmployeeId } = await searchParams;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();
  const parsedEmployeeId = Number(
    Array.isArray(rawEmployeeId) ? rawEmployeeId[0] : rawEmployeeId,
  );
  const employeeId =
    Number.isInteger(parsedEmployeeId) && parsedEmployeeId > 0
      ? parsedEmployeeId
      : undefined;

  const data = await loadBranchCountSlipData(branchId, employeeId);

  return (
    <BranchCountSlipsClient
      tenantId={data.tenantId}
      branchId={branchId}
      branchName={data.branchName}
      initialRows={data.rows}
      loadFailed={data.loadFailed}
      focusFirstPending={employeeId !== undefined}
    />
  );
}
