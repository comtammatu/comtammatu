import { notFound } from "next/navigation";
import { loadGrnDetail } from "@lib/inventory/grn-detail-data";
import { isGrnLookupParam } from "@lib/inventory/grn-detail-model";
import { BranchGrnReceiptClient } from "./branch-grn-receipt-client";
import { GrnReviewOperatorClient } from "./grn-review-operator-client";

export default async function OperatorStockGrnDetailPage({
  params,
}: {
  params: Promise<{ branchId: string; id: string }>;
}) {
  const { branchId: rawBranchId, id: rawId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();
  if (!isGrnLookupParam(rawId)) notFound();

  const data = await loadGrnDetail(rawId, branchId);
  if (!data) notFound();

  const grnListBasePath = `/br/${branchId}/stock/grn`;
  if (data.grn.status === "draft") {
    return (
      <GrnReviewOperatorClient
        grn={data.grn}
        ingredients={data.ingredients}
        canEditDraft={data.canEditDraft}
        canConfirm={data.canConfirm}
        grnListBasePath={grnListBasePath}
        purchaseOrdersBasePath={`/br/${branchId}/stock/purchase-orders`}
      />
    );
  }

  return (
    <BranchGrnReceiptClient grn={data.grn} grnListBasePath={grnListBasePath} />
  );
}
