"use client";

import { memo } from "react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { CartPane } from "./_components/cart-pane";
import { OrderListPane } from "./_components/order-list-pane";
import { useCartQuantity } from "./_hooks/use-cart";
import { usePosOperationalDispatch } from "./_providers/pos-desktop-provider";
import type { CartItem, OrderType } from "./types";

interface PosSidebarTabsProps {
  showOrders: boolean;
  onShowOrdersChange: (show: boolean) => void;
}

function PosSidebarTabsComponent({
  showOrders,
  onShowOrdersChange,
}: PosSidebarTabsProps) {
  const cartQuantity = useCartQuantity();
  const { refreshOrders } = usePosOperationalDispatch();

  return (
    <div className="border-b border-border/60 px-3 py-3">
      <Tabs
        value={showOrders ? "active-orders" : "new-order"}
        onValueChange={(value) => {
          const nextShowOrders = value === "active-orders";
          onShowOrdersChange(nextShowOrders);
          if (nextShowOrders) void refreshOrders();
        }}
        className="gap-0"
      >
        <TabsList
          aria-label="POS sidebar"
          className="grid h-11 w-full grid-cols-2 rounded-lg border bg-card p-1"
        >
          <TabsTrigger
            value="new-order"
            className="h-full min-w-0 gap-2 px-2 py-0 text-sm font-semibold"
          >
            <span className="truncate">Đơn mới</span>
            {cartQuantity > 0 && (
              <Badge variant="secondary" className="shrink-0 text-xs">
                {cartQuantity}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="active-orders"
            className="h-full min-w-0 gap-2 px-2 py-0 text-sm font-semibold"
          >
            <span className="truncate">Đơn đang phục vụ</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}

export const PosSidebarTabs = memo(PosSidebarTabsComponent);

interface PosSidebarContentProps {
  showOrders: boolean;
  canSubmit: boolean;
  isPending: boolean;
  onSubmitOrder: () => void;
  onOrderTypeChange: (type: OrderType) => void;
  onCustomizeItem: (item: CartItem) => void;
  onViewBill: (orderId: number) => void;
  onViewDetail: (orderId: number) => void;
}

function PosSidebarContentComponent({
  showOrders,
  canSubmit,
  isPending,
  onSubmitOrder,
  onOrderTypeChange,
  onCustomizeItem,
  onViewBill,
  onViewDetail,
}: PosSidebarContentProps) {
  if (showOrders) {
    return (
      <OrderListPane onViewBill={onViewBill} onViewDetail={onViewDetail} />
    );
  }

  return (
    <CartPane
      canSubmit={canSubmit}
      isSubmitting={isPending}
      onSubmitOrder={onSubmitOrder}
      onOrderTypeChange={onOrderTypeChange}
      onCustomizeItem={onCustomizeItem}
    />
  );
}

export const PosSidebarContent = memo(PosSidebarContentComponent);
