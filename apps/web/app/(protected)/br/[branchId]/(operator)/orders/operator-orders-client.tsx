"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { getPaymentMethodLabelVi } from "@comtammatu/shared/labels";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
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
  inProgressCount,
  page,
  pageSize,
  totalCount,
}: {
  orders: OrderRow[];
  inProgressCount: number;
  page: number;
  pageSize: number;
  totalCount: number;
}) {
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const replaceServerParams = useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, router, searchParams],
  );
  const view = searchParams.get("view") === "recent" ? "recent" : "active";
  const hasPreviousPage = page > 1;
  const hasNextPage = page * pageSize < totalCount;

  return (
    <>
      <Tabs
        value={view}
        onValueChange={(value) =>
          replaceServerParams({
            view: value === "recent" ? "recent" : null,
            page: null,
          })
        }
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
      {orders.length === 0 ? (
        <AppEmptyState
          title={
            view === "active"
              ? ORDERS_COPY.operatorActiveEmptyTitle
              : ORDERS_COPY.emptyTitle
          }
          description={
            view === "active"
              ? ORDERS_COPY.operatorActiveEmptyDescription
              : ORDERS_COPY.emptyDescription
          }
          compact
          symbol="riceBowl"
        />
      ) : (
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
                      {formatVNDateTime(order.created_at)}
                    </ItemDescription>
                  </ItemContent>
                  <StatusBadge domain="order" value={order.status} />
                </ItemHeader>
                <ItemFooter>
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {formatVND(order.total_amount)}
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
      )}
      {hasPreviousPage || hasNextPage ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="touch"
            variant="outline"
            disabled={!hasPreviousPage}
            onClick={() =>
              replaceServerParams({
                page: page === 2 ? null : String(page - 1),
              })
            }
          >
            {ORDERS_COPY.operatorPreviousPage}
          </Button>
          <Button
            type="button"
            size="touch"
            variant="outline"
            disabled={!hasNextPage}
            onClick={() => replaceServerParams({ page: String(page + 1) })}
          >
            {ORDERS_COPY.operatorNextPage}
          </Button>
        </div>
      ) : null}
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
