import { notFound } from "next/navigation";
import { getSafeInternalReturnTo } from "@comtammatu/shared/auth";
import { BranchStocktakeListClient } from "./branch-stocktake-list-client";
import { loadBranchStocktakeListData } from "@lib/inventory/branch-stocktake-data";

interface PageProps {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}

export default async function OperatorStocktakePage({
  params,
  searchParams,
}: PageProps) {
  const [{ branchId: rawBranchId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const data = await loadBranchStocktakeListData(branchId);
  const stockBasePath = `/br/${branchId}/stock`;
  const rawReturnTo = Array.isArray(query.returnTo)
    ? query.returnTo[0]
    : query.returnTo;
  const safeReturnTo = getSafeInternalReturnTo(rawReturnTo);
  const backHref =
    safeReturnTo === stockBasePath ||
    safeReturnTo?.startsWith(`${stockBasePath}?`)
      ? safeReturnTo
      : stockBasePath;

  return <BranchStocktakeListClient {...data} backHref={backHref} />;
}
