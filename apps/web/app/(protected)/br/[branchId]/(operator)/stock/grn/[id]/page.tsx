import { notFound } from "next/navigation";
import { getSafeInternalReturnTo } from "@comtammatu/shared/auth";
import { loadGrnDetail } from "@lib/inventory/grn-detail-data";
import { isGrnLookupParam } from "@lib/inventory/grn-detail-model";
import { BranchGrnReceiptClient } from "./branch-grn-receipt-client";
import { GrnReviewOperatorClient } from "./grn-review-operator-client";

export default async function OperatorStockGrnDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string; id: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const [{ branchId: rawBranchId, id: rawId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();
  if (!isGrnLookupParam(rawId)) notFound();

  const data = await loadGrnDetail(rawId, branchId);
  if (!data) notFound();

  const stockBasePath = `/br/${branchId}/stock`;
  const grnListBasePath = `${stockBasePath}/grn`;
  const rawReturnTo = Array.isArray(query.returnTo)
    ? query.returnTo[0]
    : query.returnTo;
  const safeReturnTo = getSafeInternalReturnTo(rawReturnTo);
  const grnListHref =
    safeReturnTo === stockBasePath ||
    safeReturnTo?.startsWith(`${stockBasePath}?`) ||
    safeReturnTo === grnListBasePath ||
    safeReturnTo?.startsWith(`${grnListBasePath}?`)
      ? safeReturnTo
      : grnListBasePath;
  if (data.grn.status === "draft") {
    return (
      <GrnReviewOperatorClient
        grn={data.grn}
        ingredients={data.ingredients}
        canEditDraft={data.canEditDraft}
        canConfirm={data.canConfirm}
        grnListBasePath={grnListHref}
      />
    );
  }

  return (
    <BranchGrnReceiptClient grn={data.grn} grnListBasePath={grnListHref} />
  );
}
