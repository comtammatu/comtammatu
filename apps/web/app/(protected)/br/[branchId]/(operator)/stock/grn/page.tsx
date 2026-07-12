import { notFound } from "next/navigation";
import { getSafeInternalReturnTo } from "@comtammatu/shared/auth";
import { loadGrnListPageData } from "@lib/inventory/grn-list-data";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";
import { BranchGrnListClient } from "./branch-grn-list-client";

interface PageProps {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}

export default async function OperatorStockGrnPage({
  params,
  searchParams,
}: PageProps) {
  const [{ branchId: rawBranchId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const data = await loadGrnListPageData({ routeBranchId: branchId });
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

  return (
    <BranchGrnListClient
      branchId={branchId}
      backHref={backHref}
      canCreate={data.canCreate}
      drafts={data.drafts.map(
        ({
          grnId,
          supplierId,
          poId,
          poCode,
          supplierName,
          grnNumber,
          updatedAt,
          lineCount,
        }) => ({
          grnId,
          supplierId,
          poId,
          poCode,
          supplierName,
          grnNumber,
          updatedAt,
          lineCount,
        }),
      )}
      draftsLoadFailed={data.draftsLoadFailed}
      grns={data.grns.map(
        ({ id, code, supplierName, poId, poCode, date, status }) => ({
          id,
          code,
          supplierName,
          poId,
          poCode,
          date,
          status,
        }),
      )}
      grnsLoadFailed={data.grnsLoadFailed}
    />
  );
}
