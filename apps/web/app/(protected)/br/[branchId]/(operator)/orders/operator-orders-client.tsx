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
import { AppEmptyState } from "@/components/surface";
import { StatusBadge } from "@/components/status-badge";
import { OrderDetailSheet } from "@/(protected)/orders/order-detail-sheet";
import type { OrderRow } from "@/(protected)/orders/actions";
import { ORDERS_COPY } from "@/(protected)/orders/orders-copy";

export function OperatorOrdersClient({
  orders,
  totalCount,
}: {
  orders: OrderRow[];
  totalCount: number;
}) {
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);

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
      <ItemGroup className="gap-2">
        {orders.map((order) => (
          <Item
            key={order.id}
            asChild
            variant="outline"
            size="sm"
            className="chrome-tap min-h-14 bg-card text-left"
          >
            <button type="button" onClick={() => setSelectedOrder(order)}>
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
            </button>
          </Item>
        ))}
      </ItemGroup>
      <p className="text-sm text-muted-foreground">
        {ORDERS_COPY.operatorCountNote(orders.length, totalCount)}
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
