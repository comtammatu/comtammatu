import { notFound } from "next/navigation";
import { loadGrnDetail } from "@/(protected)/inventory/grn/[id]/page";
import { GRNDetailClient } from "@/(protected)/inventory/grn/[id]/grn-detail-client";
import { GrnReviewOperatorClient } from "./grn-review-operator-client";

export default async function OperatorStockGrnDetailPage({
  params,
}: {
  params: Promise<{ branchId: string; id: string }>;
}) {
  const { branchId: rawBranchId, id: rawId } = await params;
  const branchId = Number(rawBranchId);
  const grnId = Number(rawId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();
  if (!Number.isInteger(grnId) || grnId <= 0) notFound();

  const data = await loadGrnDetail(grnId, branchId);
  if (!data) notFound();

  const grnListBasePath = `/br/${branchId}/stock/grn`;
  const purchaseOrdersBasePath = `/br/${branchId}/stock/purchase-orders`;

  if (data.grn.status === "draft") {
    return (
      <GrnReviewOperatorClient
        grn={data.grn}
        ingredients={data.ingredients}
        grnListBasePath={grnListBasePath}
        purchaseOrdersBasePath={purchaseOrdersBasePath}
      />
    );
  }

  return (
    <GRNDetailClient
      grn={data.grn}
      ingredients={data.ingredients}
      canAdjustStock={data.canAdjustStock}
      canAmendConfirmed={data.canAmendConfirmed}
      auditLogs={data.auditLogs}
      grnListBasePath={grnListBasePath}
      grnMobileBackPath={grnListBasePath}
      purchaseOrdersBasePath={purchaseOrdersBasePath}
      embedded
    />
  );
}
