import { notFound } from "next/navigation";
import { BranchGrnCreateClient } from "./branch-grn-create-client";
import { loadGrnCreatePageData } from "@lib/inventory/grn-create-data";

interface PageProps {
  params: Promise<{ branchId: string; supplierId: string }>;
  searchParams: Promise<{ branchId?: string | string[] }>;
}

export default async function OperatorStockGrnCreatePage({
  params,
  searchParams,
}: PageProps) {
  const { branchId: rawBranchId, supplierId: rawSupplierId } = await params;
  const branchId = Number(rawBranchId);
  const supplierId = Number(rawSupplierId);
  if (
    !Number.isInteger(branchId) ||
    branchId <= 0 ||
    !Number.isInteger(supplierId) ||
    supplierId <= 0
  ) {
    notFound();
  }

  const queryParams = await searchParams;
  const sourceBasePath = `/br/${branchId}/stock/grn/new`;
  const grnBasePath = `/br/${branchId}/stock/grn`;
  const data = await loadGrnCreatePageData({
    supplierId,
    queryBranchId: queryParams.branchId,
    routeBranchId: branchId,
    fallbackPath: sourceBasePath,
    grnBasePath,
  });

  return (
    <BranchGrnCreateClient
      {...data}
      sourceBasePath={sourceBasePath}
      grnBasePath={grnBasePath}
    />
  );
}
