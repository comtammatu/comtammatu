import { notFound } from "next/navigation";
import { getSafeInternalReturnTo } from "@comtammatu/shared/auth";
import { loadBranchWasteCreateData } from "@lib/inventory/branch-waste-create-data";
import { BranchWasteCreateClient } from "./branch-waste-create-client";

interface PageProps {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}

export default async function OperatorStockWastePage({
  params,
  searchParams,
}: PageProps) {
  const [{ branchId: rawBranchId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

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
  const data = await loadBranchWasteCreateData(branchId);
  return <BranchWasteCreateClient {...data} backHref={backHref} />;
}
