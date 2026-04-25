"use client";

import { memo } from "react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { AppendDraftPane } from "./_components/append-draft-pane";
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
          className="grid h-11 w-full grid-cols-2"
        >
          <TabsTrigger
            value="new-order"
            className="h-full min-w-0 gap-2 px-2 py-0 text-base font-semibold"
          >
            <span className="truncate">Giỏ đơn mới</span>
            {cartQuantity > 0 && (
              <Badge variant="secondary" className="shrink-0 text-sm">
                {cartQuantity}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="active-orders"
            data-testid="pos-active-orders-tab"
            className="h-full min-w-0 gap-2 px-2 py-0 text-base font-semibold"
          >
            <span className="truncate">Đơn cần xử lý</span>
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
  appendDraft: {
    target: { orderId: number; orderNumber: string } | null;
    items: CartItem[];
    isSubmitting: boolean;
    onSubmit: () => void;
    onCancel: () => void;
    onRemoveItem: (key: string) => void;
  };
  onSubmitOrder: () => void;
  onOrderTypeChange: (type: OrderType) => void;
  onCustomizeItem: (item: CartItem) => void;
  onViewBill: (orderId: number) => void;
  onViewDetail: (orderId: number, orderNumber: string) => void;
  onReturnToTables?: () => void;
}

function PosSidebarContentComponent({
  showOrders,
  canSubmit,
  isPending,
  appendDraft,
  onSubmitOrder,
  onOrderTypeChange,
  onCustomizeItem,
  onViewBill,
  onViewDetail,
  onReturnToTables,
}: PosSidebarContentProps) {
  if (appendDraft.target != null) {
    return (
      <AppendDraftPane
        orderNumber={appendDraft.target.orderNumber}
        items={appendDraft.items}
        isSubmitting={appendDraft.isSubmitting}
        onSubmit={appendDraft.onSubmit}
        onCancel={appendDraft.onCancel}
        onRemoveItem={appendDraft.onRemoveItem}
      />
    );
  }

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
      onReturnToTables={onReturnToTables}
    />
  );
}

export const PosSidebarContent = memo(PosSidebarContentComponent);
