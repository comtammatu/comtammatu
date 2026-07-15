import { notFound } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { fetchActiveBranches, resolveListScope } from "@/_lib/branch-context";
import { fetchOrders } from "./actions";
import { fetchRefunds } from "./refund-actions";
import { OrdersPageBody } from "./orders-page-body";
import { AppPage, AppPageHeader, AppEmptyState } from "@/components/surface";

import { ORDER_VI } from "@comtammatu/shared/messages";
import { ORDERS_COPY } from "./orders-copy";

interface OrdersPageContentProps {
  searchParams?: Promise<{
    branchId?: string | string[];
    orderId?: string | string[];
  }>;
  routeBranchId?: number;
  embedded?: boolean;
}

export async function OrdersPageContent({
  searchParams,
  routeBranchId,
  embedded = false,
}: OrdersPageContentProps) {
  const params = searchParams ? await searchParams : {};
  const { supabase, claims } = await loadAuthState();
  const rawOrderId = Array.isArray(params.orderId)
    ? params.orderId[0]
    : params.orderId;
  const requestedOrderId =
    typeof rawOrderId === "string" && /^\d+$/.test(rawOrderId)
      ? Number(rawOrderId)
      : null;

  // Scope resolution only applies to embedded (routeBranchId) callers: the
  // engine always resolves a concrete default branch, which would narrow the
  // office page's unfiltered-by-default view for owner.
  let branchFilter: number | undefined;
  if (routeBranchId != null) {
    const branches = await fetchActiveBranches(supabase, claims.tenant_id);
    const scope = await resolveListScope(supabase, claims, branches, {
      routeBranchId,
      queryBranchId: params.branchId,
      tenantWideRoles: ["owner"],
    });
    if (scope.outOfScope) notFound();
    branchFilter = scope.selectedBranchId ?? undefined;
  }

  const [ordersResult, refundsResult, selectedOrderResult] = await Promise.all([
    fetchOrders(branchFilter != null ? { branchId: branchFilter } : undefined),
    fetchRefunds(),
    requestedOrderId != null
      ? fetchOrders({
          orderId: requestedOrderId,
          ...(branchFilter != null ? { branchId: branchFilter } : {}),
        })
      : Promise.resolve(null),
  ]);

  if (!ordersResult.success || !ordersResult.data) {
    return (
      <AppPage width="wide">
        <AppPageHeader title={ORDER_VI.long} />
        <AppEmptyState
          mode="error"
          description={ordersResult.error ?? ORDERS_COPY.loadFailed}
        />
      </AppPage>
    );
  }

  const { orders, branches: orderBranches, summary } = ordersResult.data;
  const refunds = refundsResult.success
    ? (refundsResult.data?.refunds ?? [])
    : [];
  const initialSelectedOrder =
    selectedOrderResult?.success === true
      ? (selectedOrderResult.data?.orders[0] ?? null)
      : null;
  if (requestedOrderId != null && initialSelectedOrder == null) notFound();

  const isManagerOrAbove = claims.user_role === "owner";
  const canApproveRefund = claims.user_role === "owner";

  return (
    <OrdersPageBody
      orders={orders}
      summary={summary}
      branches={orderBranches}
      showBranchFilter={isManagerOrAbove}
      refunds={refunds}
      canApproveRefund={canApproveRefund}
      initialSelectedOrder={initialSelectedOrder}
      embedded={embedded}
    />
  );
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams?: Promise<{
    branchId?: string | string[];
    orderId?: string | string[];
  }>;
}) {
  return <OrdersPageContent searchParams={searchParams} />;
}
