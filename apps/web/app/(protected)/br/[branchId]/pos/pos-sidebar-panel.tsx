"use client";

import { memo } from "react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { AppendDraftPane } from "./_components/append-draft-pane";
import { CartPane, type SubmitOrderOptions } from "./_components/cart-pane";
import { OrderListPane } from "./_components/order-list-pane";
import type { BillReceiptIntent } from "./_components/bill/bill-receipt-types";
import { useCartQuantity } from "./_hooks/use-cart";
import { usePosOperationalDispatch } from "./_providers/pos-desktop-provider";
import type { SessionOrder } from "./order-history";
import type { CartItem, OrderType } from "./types";
import { messages } from "@lib/messages";

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
        className="gap-1"
      >
        <TabsList
          aria-label="POS sidebar"
          className="grid h-11 w-full grid-cols-2"
        >
          <TabsTrigger
            value="new-order"
            className="h-full min-w-0 gap-2 px-2 py-0 text-base font-semibold"
          >
            <span className="truncate">
              {messages.pos.desktop.pendingNewTitle}
            </span>
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
            <span className="truncate">
              {messages.pos.orderHistory.sessionOrders}
            </span>
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
    target: {
      orderId: number;
      orderNumber: string;
      targetLabel: string;
    } | null;
    items: CartItem[];
    isSubmitting: boolean;
    onSubmit: () => void;
    onCancel: () => void;
    onRemoveItem: (key: string) => void;
    onEditItem: (item: CartItem) => void;
  };
  onClosePane?: () => void;
  onSubmitOrder: (options?: SubmitOrderOptions) => void;
  onOrderTypeChange: (type: OrderType) => void;
  onCustomizeItem: (item: CartItem) => void;
  onViewBill: (orderId: number, intent?: BillReceiptIntent) => void;
  onViewDetail: (
    orderId: number,
    orderNumber: string,
    summary?: SessionOrder,
  ) => void;
  onOpenArchivedSheet?: () => void;
  onReturnToTables?: () => void;
  hideTakeawayOrders?: boolean;
}

function PosSidebarContentComponent({
  showOrders,
  canSubmit,
  isPending,
  appendDraft,
  onClosePane,
  onSubmitOrder,
  onOrderTypeChange,
  onCustomizeItem,
  onViewBill,
  onViewDetail,
  onOpenArchivedSheet,
  onReturnToTables,
  hideTakeawayOrders,
}: PosSidebarContentProps) {
  if (appendDraft.target != null) {
    return (
      <AppendDraftPane
        targetLabel={appendDraft.target.targetLabel}
        items={appendDraft.items}
        isSubmitting={appendDraft.isSubmitting}
        onSubmit={appendDraft.onSubmit}
        onCancel={appendDraft.onCancel}
        onClosePane={onClosePane}
        onRemoveItem={appendDraft.onRemoveItem}
        onEditItem={appendDraft.onEditItem}
      />
    );
  }

  if (showOrders) {
    return (
      <OrderListPane
        onViewBill={onViewBill}
        onViewDetail={onViewDetail}
        onClosePane={onClosePane}
        onOpenArchivedSheet={onOpenArchivedSheet}
        hideTakeawayOrders={hideTakeawayOrders}
      />
    );
  }

  return (
    <CartPane
      canSubmit={canSubmit}
      isSubmitting={isPending}
      onSubmitOrder={onSubmitOrder}
      onOrderTypeChange={onOrderTypeChange}
      onCustomizeItem={onCustomizeItem}
      onClosePane={onClosePane}
      onReturnToTables={onReturnToTables}
    />
  );
}

export const PosSidebarContent = memo(PosSidebarContentComponent);
