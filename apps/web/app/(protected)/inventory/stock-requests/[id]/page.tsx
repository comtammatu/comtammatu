import { notFound, redirect } from "next/navigation";
import { STOCK_REQUEST_FULFILL_ROLES } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { StockRequestDetailView } from "@/components/stock-request-detail-view";
import { loadStockRequestFulfillmentDetail } from "@lib/inventory/stock-request-fulfillment-detail-data";
import { StockRequestFulfillClient } from "./stock-request-fulfill-client";

export default async function InventoryStockRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const requestId = Number(rawId);
  if (!Number.isInteger(requestId) || requestId <= 0) notFound();

  const auth = await loadAuthState();
  if (
    !STOCK_REQUEST_FULFILL_ROLES.includes(
      auth.claims.user_role as (typeof STOCK_REQUEST_FULFILL_ROLES)[number],
    )
  ) {
    redirect("/inventory");
  }
  const detail = await loadStockRequestFulfillmentDetail({
    ...auth,
    requestId,
  });
  if (!detail) notFound();

  return (
    <StockRequestDetailView
      data={detail.data}
      mode="central"
      actions={
        <StockRequestFulfillClient
          requestId={detail.data.id}
          requestNumber={detail.data.requestNumber}
          status={detail.data.status}
          branchLabel={detail.data.branchName}
          groups={detail.groups}
          embedded
          canClose={detail.canClose}
        />
      }
    />
  );
}
