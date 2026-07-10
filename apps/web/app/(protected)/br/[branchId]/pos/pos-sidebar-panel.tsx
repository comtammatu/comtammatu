"use client";

import { memo } from "react";
import { AppendDraftPane } from "./_components/append-draft-pane";
import { CartPane, type SubmitOrderOptions } from "./_components/cart-pane";
import { OrderListPane } from "./_components/order-list-pane";
import type { BillReceiptIntent } from "./_components/bill/bill-receipt-types";
import type { SessionOrder } from "./order-history";
import type { CartItem, OrderType } from "./types";

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
