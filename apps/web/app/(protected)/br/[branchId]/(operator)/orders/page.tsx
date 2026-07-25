import { notFound } from "next/navigation";
import { ORDER_VI } from "@comtammatu/shared/messages";
import { AppEmptyState } from "@/components/surface";
import { fetchOrders } from "@/(protected)/orders/actions";
import { ORDERS_COPY } from "@/(protected)/orders/orders-copy";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { parseOperatorBranchId } from "../../_lib/parse-branch-id";
import { OperatorOrdersClient } from "./operator-orders-client";

interface PageProps {
  params: Promise<{ branchId: string }>;
  searchParams?: Promise<{ orderId?: string | string[] }>;
}

export default async function OperatorOrdersPage({
  params,
  searchParams,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const query = searchParams ? await searchParams : {};
  const rawOrderId = Array.isArray(query.orderId)
    ? query.orderId[0]
    : query.orderId;
  const requestedOrderId =
    typeof rawOrderId === "string" && /^\d+$/.test(rawOrderId)
      ? Number(rawOrderId)
      : null;
  const [result, selectedOrderResult] = await Promise.all([
    fetchOrders({ branchId }),
    requestedOrderId == null
      ? Promise.resolve(null)
      : fetchOrders({ branchId, orderId: requestedOrderId }),
  ]);
  const initialSelectedOrder =
    selectedOrderResult?.success === true
      ? (selectedOrderResult.data?.orders[0] ?? null)
      : null;
  if (requestedOrderId != null && initialSelectedOrder == null) notFound();

  return (
    <BranchOperatorPage
      title={ORDER_VI.long}
      description={ORDERS_COPY.operatorDescription}
      hideHeaderOnMobile
    >
      {result.success && result.data ? (
        <OperatorOrdersClient
          orders={result.data.orders}
          totalCount={result.data.summary.totalCount}
          inProgressCount={result.data.summary.inProgressCount}
          initialSelectedOrder={initialSelectedOrder}
        />
      ) : (
        <AppEmptyState
          mode="error"
          description={result.error ?? ORDERS_COPY.loadFailed}
          compact
        />
      )}
    </BranchOperatorPage>
  );
}
