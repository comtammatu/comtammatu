import { notFound } from "next/navigation";
import { getSafeInternalReturnTo } from "@comtammatu/shared/auth";
import { BranchGrnCreateClient } from "./branch-grn-create-client";
import { loadGrnCreatePageData } from "@lib/inventory/grn-create-data";

interface PageProps {
  params: Promise<{ branchId: string; supplierId: string }>;
  searchParams: Promise<{
    branchId?: string | string[];
    returnTo?: string | string[];
  }>;
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
  const stockBasePath = `/br/${branchId}/stock`;
  const grnListBasePath = `${stockBasePath}/grn`;
  const rawReturnTo = Array.isArray(queryParams.returnTo)
    ? queryParams.returnTo[0]
    : queryParams.returnTo;
  const safeReturnTo = getSafeInternalReturnTo(rawReturnTo);
  const returnTo =
    safeReturnTo === stockBasePath ||
    safeReturnTo?.startsWith(`${stockBasePath}?`) ||
    safeReturnTo === grnListBasePath ||
    safeReturnTo?.startsWith(`${grnListBasePath}?`)
      ? safeReturnTo
      : grnListBasePath;
  const sourceHref = `${sourceBasePath}?returnTo=${encodeURIComponent(returnTo)}`;
  const data = await loadGrnCreatePageData({
    supplierId,
    queryBranchId: queryParams.branchId,
    routeBranchId: branchId,
    fallbackPath: sourceHref,
  });

  return (
    <BranchGrnCreateClient
      {...data}
      sourceBasePath={sourceHref}
      backHref={sourceHref}
      grnBasePath={grnListBasePath}
      returnTo={returnTo}
    />
  );
}
