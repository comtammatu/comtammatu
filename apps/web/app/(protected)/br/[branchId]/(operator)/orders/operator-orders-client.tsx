"use client";

import { useState } from "react";
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
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { AppEmptyState } from "@/components/surface";
import { StatusBadge } from "@/components/status-badge";
import { OrderDetailSheet } from "@/(protected)/orders/order-detail-sheet";
import type { OrderRow } from "@/(protected)/orders/actions";
import { ORDERS_COPY } from "@/(protected)/orders/orders-copy";

export function OperatorOrdersClient({
  orders,
  totalCount,
  inProgressCount,
}: {
  orders: OrderRow[];
  totalCount: number;
  inProgressCount: number;
}) {
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);
  const [view, setView] = useState<"active" | "recent">("active");
  const activeOrders = orders.filter(
    (order) => order.status !== "completed" && order.status !== "cancelled",
  );
  const visibleOrders = view === "active" ? activeOrders : orders;

  if (orders.length === 0) {
    return (
      <AppEmptyState
        title={ORDERS_COPY.emptyTitle}
        description={ORDERS_COPY.emptyDescription}
        compact
        symbol="riceBowl"
      />
    );
  }

  return (
    <>
      <Tabs
        value={view}
        onValueChange={(value) => setView(value as typeof view)}
      >
        <TabsList
          className="grid min-h-12 w-full grid-cols-2"
          aria-label={ORDERS_COPY.operatorTabsAriaLabel}
        >
          <TabsTrigger value="active" className="min-h-11">
            {ORDERS_COPY.operatorActiveTab(inProgressCount)}
          </TabsTrigger>
          <TabsTrigger value="recent" className="min-h-11">
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
          {visibleOrders.map((order) => (
            <Item
              key={order.id}
              variant="outline"
              size="sm"
              className="chrome-tap min-h-14 bg-card text-left"
              render={
                <button type="button" onClick={() => setSelectedOrder(order)} />
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
                <StatusBadge domain="order" value={order.status} />
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
          ))}
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
