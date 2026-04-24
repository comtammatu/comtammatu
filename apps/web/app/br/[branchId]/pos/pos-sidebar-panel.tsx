"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { CartPane } from "./_components/cart-pane";
import { OrderListPane } from "./_components/order-list-pane";
import { useCart } from "./_hooks/use-cart";
import { usePosOperationalDispatch } from "./_providers/pos-desktop-provider";
import type { OrderType } from "./types";

interface PosSidebarTabsProps {
  showOrders: boolean;
  onShowOrdersChange: (show: boolean) => void;
}

export function PosSidebarTabs({
  showOrders,
  onShowOrdersChange,
}: PosSidebarTabsProps) {
  const cart = useCart();
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
          className="grid h-auto w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)] rounded-lg border bg-card p-2"
        >
          <TabsTrigger
            value="new-order"
            className="min-w-0 gap-2 py-2.5 text-sm font-semibold"
          >
            <span className="truncate">Đơn mới</span>
            {cart.quantity > 0 && (
              <Badge variant="secondary" className="shrink-0 text-xs">
                {cart.quantity}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="active-orders"
            className="min-w-0 gap-2 py-2.5 text-sm font-semibold"
          >
            <span className="truncate">Đơn đang phục vụ</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}

interface PosSidebarContentProps {
  showOrders: boolean;
  canSubmit: boolean;
  isPending: boolean;
  onSubmitOrder: () => void;
  onOrderTypeChange: (type: OrderType) => void;
  onRequestChangeTable: () => void;
  onViewBill: (orderId: number) => void;
  onViewDetail: (orderId: number) => void;
}

export function PosSidebarContent({
  showOrders,
  canSubmit,
  isPending,
  onSubmitOrder,
  onOrderTypeChange,
  onRequestChangeTable,
  onViewBill,
  onViewDetail,
}: PosSidebarContentProps) {
  if (showOrders) {
    return <OrderListPane onViewBill={onViewBill} onViewDetail={onViewDetail} />;
  }

  return (
    <CartPane
      canSubmit={canSubmit}
      isSubmitting={isPending}
      onSubmitOrder={onSubmitOrder}
      onOrderTypeChange={onOrderTypeChange}
      onRequestChangeTable={onRequestChangeTable}
    />
  );
}
