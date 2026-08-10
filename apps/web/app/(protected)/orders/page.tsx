import { notFound } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { fetchActiveBranches, resolveListScope } from "@/_lib/branch-context";
import { fetchOrders } from "./actions";
import { fetchRefunds } from "./refund-actions";
import { OrdersPageBody } from "./orders-page-body";
import { AppPage, AppPageHeader, AppEmptyState } from "@/components/surface";

import { ORDER_VI } from "@comtammatu/shared/messages";
import { ORDERS_COPY } from "./orders-copy";

function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  return Number(raw);
}

function parseDateParam(raw: string | undefined): string | undefined {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  return raw;
}

interface OrdersPageContentProps {
  searchParams?: Promise<{
    branchId?: string | string[];
    orderId?: string | string[];
    dateFrom?: string | string[];
    dateTo?: string | string[];
    status?: string | string[];
    alert?: string | string[];
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
  const requestedOrderId = parsePositiveInt(firstParam(params.orderId)) ?? null;
  const dateFrom = parseDateParam(firstParam(params.dateFrom));
  const dateTo = parseDateParam(firstParam(params.dateTo));
  const status = firstParam(params.status)?.trim() || undefined;
  const queryBranchId = parsePositiveInt(firstParam(params.branchId));

  // Scope resolution only applies to embedded (routeBranchId) callers: the
  // engine always resolves a concrete default branch, which would narrow the
  // Owner surface page's unfiltered-by-default view for owner.
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
  } else if (queryBranchId != null) {
    branchFilter = queryBranchId;
  }

  const listFilters = {
    ...(branchFilter != null ? { branchId: branchFilter } : {}),
    ...(status ? { status } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  };

  const [ordersResult, refundsResult, selectedOrderResult] = await Promise.all([
    fetchOrders(
      Object.keys(listFilters).length > 0 ? listFilters : undefined,
    ),
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
      <AppPage width="xwide" density="compact">
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
    dateFrom?: string | string[];
    dateTo?: string | string[];
    status?: string | string[];
    alert?: string | string[];
  }>;
}) {
  return <OrdersPageContent searchParams={searchParams} />;
}
