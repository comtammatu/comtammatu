"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { BRANCH_VI, STAFF_VI } from "@comtammatu/shared/messages";
import { getPaymentMethodLabelVi } from "@comtammatu/shared/labels";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { AppEmptyState } from "@/components/surface";
import { StatusBadge } from "@/components/status-badge";
import { OrderDetailSheet } from "@/(protected)/orders/order-detail-sheet";
import type { OrderRow } from "@/(protected)/orders/actions";
import { orders as ORDERS_COPY } from "@lib/messages/orders";
import { VoidRequestQueue } from "@/(protected)/br/[branchId]/pos/_components/void-request-queue";

import {
  computeOrderWaitInfo,
  getOrderAlertBadgeProps,
} from "@/(protected)/orders/_lib/order-wait-time";

type OrderView = "active" | "recent";
const VALID_VIEWS: readonly OrderView[] = ["active", "recent"] as const;

export function OperatorOrdersClient({
  orders,
  totalCount,
  inProgressCount,
  branchId,
  initialSelectedOrder = null,
}: {
  orders: OrderRow[];
  totalCount: number;
  inProgressCount: number;
  branchId: number;
  initialSelectedOrder?: OrderRow | null;
}) {
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(
    initialSelectedOrder,
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const requested = searchParams.get("view");
  const view: OrderView =
    requested && (VALID_VIEWS as readonly string[]).includes(requested)
      ? (requested as OrderView)
      : "active";

  const onValueChange = useCallback(
    (next: string) => {
      if (!next) return;
      const params = new URLSearchParams(searchParams.toString());
      if (next === "active") params.delete("view");
      else params.set("view", next);
      const q = params.toString();
      startTransition(() => {
        router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const activeOrders = orders.filter(
    (order) => order.status !== "completed" && order.status !== "cancelled",
  );
  const visibleOrders = view === "active" ? activeOrders : orders;
  const hasLiveWait = visibleOrders.some(
    (order) =>
      order.status !== "completed" &&
      order.status !== "cancelled" &&
      !order.kds_completed_at,
  );

  useEffect(() => {
    if (!hasLiveWait) return;
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 15000);
    return () => clearInterval(timer);
  }, [hasLiveWait]);

  if (orders.length === 0) {
    return (
      <>
        <VoidRequestQueue branchId={branchId} />
        <AppEmptyState
          title={ORDERS_COPY.emptyTitle}
          description={ORDERS_COPY.emptyDescription}
          compact
          symbol="riceBowl"
        />
      </>
    );
  }

  return (
    <>
      <VoidRequestQueue branchId={branchId} />
      <Tabs
        value={view}
        onValueChange={onValueChange}
        className="w-full"
      >
        <TabsList
          size="touch"
          aria-label={ORDERS_COPY.operatorTabsAriaLabel}
          className="grid w-full grid-cols-2"
        >
          <TabsTrigger
            value="active"
            aria-label={ORDERS_COPY.operatorActiveAria(inProgressCount)}
          >
            {ORDERS_COPY.operatorActiveTab(inProgressCount)}
          </TabsTrigger>
          <TabsTrigger
            value="recent"
            aria-label={ORDERS_COPY.operatorRecentAria}
          >
            {ORDERS_COPY.operatorRecentTab}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {visibleOrders.length === 0 ? (
        <AppEmptyState
          title={ORDERS_COPY.operatorActiveEmptyTitle}
          description={ORDERS_COPY.operatorActiveEmptyDescription}
          compact
          symbol="riceBowl"
        />
      ) : (
        <ItemGroup className="gap-2">
          {visibleOrders.map((order) => {
            const waitInfo = computeOrderWaitInfo(
              order.created_at,
              order.kds_completed_at,
              nowMs,
            );
            const badgeProps = getOrderAlertBadgeProps(waitInfo);

            return (
              <Item
                key={order.id}
                variant="outline"
                size="sm"
                className="chrome-tap min-h-14 bg-card text-left"
                render={
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(order)}
                  />
                }
              >
                <ItemHeader>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="font-mono">
                      {order.order_number}
                    </ItemTitle>
                    <ItemDescription>
                      {STAFF_VI.long}: {order.created_by_name}
                    </ItemDescription>
                  </ItemContent>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge domain="order" value={order.status} />
                    <Badge
                      variant={badgeProps.badgeVariant}
                      className={badgeProps.badgeClassName}
                    >
                      {badgeProps.label}
                    </Badge>
                  </div>
                </ItemHeader>
                <ItemFooter>
                  <span className="text-xs text-muted-foreground">
                    {BRANCH_VI.long}: {order.branch_name}
                  </span>
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {formatVND(order.total_amount)}
                  </span>
                </ItemFooter>
                <ItemFooter>
                  <span className="text-xs text-muted-foreground">
                    {formatVNDateTime(order.created_at)}
                  </span>
                  {order.payment_method ? (
                    <Badge variant="outline" className="text-xs">
                      {getPaymentMethodLabelVi(order.payment_method)}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {ORDERS_COPY.noPayment}
                    </span>
                  )}
                </ItemFooter>
              </Item>
            );
          })}
        </ItemGroup>
      )}
      <p className="text-sm text-muted-foreground">
        {view === "active"
          ? ORDERS_COPY.operatorActiveCountNote(
              activeOrders.length,
              inProgressCount,
            )
          : ORDERS_COPY.operatorCountNote(orders.length, totalCount)}
      </p>
      <OrderDetailSheet
        order={selectedOrder}
        open={selectedOrder != null}
        onOpenChange={(open) => {
          if (!open) setSelectedOrder(null);
        }}
      />
    </>
  );
}
