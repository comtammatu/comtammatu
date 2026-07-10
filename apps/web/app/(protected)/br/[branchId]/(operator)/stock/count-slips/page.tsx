import { notFound } from "next/navigation";
import { loadBranchCountSlipData } from "@lib/inventory/branch-count-slip-data";
import { BranchCountSlipsClient } from "./branch-count-slips-client";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorCountSlipsPage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const data = await loadBranchCountSlipData(branchId);

  return (
    <BranchCountSlipsClient
      branchId={data.branchId}
      branchName={data.branchName}
      initialRows={data.rows}
      loadFailed={data.loadFailed}
    />
  );
}
