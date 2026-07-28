"use client";

import { useCallback, useState, useTransition } from "react";
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
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import { AppEmptyState } from "@/components/surface";
import { StatusBadge } from "@/components/status-badge";
import { OrderDetailSheet } from "@/(protected)/orders/order-detail-sheet";
import type { OrderRow } from "@/(protected)/orders/actions";
import { ORDERS_COPY } from "@/(protected)/orders/orders-copy";

type OrderView = "active" | "recent";
const VALID_VIEWS: readonly OrderView[] = ["active", "recent"] as const;

export function OperatorOrdersClient({
  orders,
  totalCount,
  inProgressCount,
  initialSelectedOrder = null,
}: {
  orders: OrderRow[];
  totalCount: number;
  inProgressCount: number;
  initialSelectedOrder?: OrderRow | null;
}) {
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(
    initialSelectedOrder,
  );
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
      <ToggleGroup
        type="single"
        variant="outline"
        size="touch"
        className="grid w-full grid-cols-2"
        value={view}
        onValueChange={onValueChange}
        aria-label={ORDERS_COPY.operatorTabsAriaLabel}
      >
        <ToggleGroupItem value="active" aria-label={ORDERS_COPY.operatorActiveAria(inProgressCount)}>
          {ORDERS_COPY.operatorActiveTab(inProgressCount)}
        </ToggleGroupItem>
        <ToggleGroupItem value="recent" aria-label={ORDERS_COPY.operatorRecentAria}>
          {ORDERS_COPY.operatorRecentTab}
        </ToggleGroupItem>
      </ToggleGroup>
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
