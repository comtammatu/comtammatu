"use client";

import { Button } from "@comtammatu/ui/components/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { DoorOpen } from "lucide-react";
import { CartSidebar } from "./cart-sidebar";
import { OrderHistory } from "./order-history";
import type { CartItem, OrderType } from "./types";
import type { BranchTable } from "./page";
import type { SessionOrder } from "./order-history";

interface PosSidebarPanelProps {
  showOrders: boolean;
  onShowOrdersChange: (show: boolean) => void;
  cartItems: CartItem[];
  cartTotal: number;
  cartQuantity: number;
  orderType: OrderType;
  selectedTableId: number | null;
  tables: BranchTable[];
  flowProgressPercent: number;
  flowHeadline: string;
  flowHint: string;
  canSubmit: boolean;
  isPending: boolean;
  sessionOrders: SessionOrder[];
  orderNote: string;
  onUpdateQuantity: (key: string, delta: number) => void;
  onRemoveItem: (key: string) => void;
  onClearCart: () => void;
  onOrderTypeChange: (type: OrderType) => void;
  onRequestChangeTable: () => void;
  onSubmitOrder: () => void;
  onOrderNoteChange: (note: string) => void;
  onViewBill: (orderId: number) => void;
  onViewDetail: (orderId: number) => void;
  onLoadSessionOrders: () => void;
}

export function PosSidebarTabs({
  showOrders,
  onShowOrdersChange,
  cartQuantity,
  onLoadSessionOrders,
}: Pick<
  PosSidebarPanelProps,
  | "showOrders"
  | "onShowOrdersChange"
  | "cartQuantity"
  | "onLoadSessionOrders"
>) {
  return (
    <div className="border-b border-border/60 px-3 py-3">
      <Tabs
        value={showOrders ? "active-orders" : "new-order"}
        onValueChange={(value) => {
          const nextShowOrders = value === "active-orders";
          onShowOrdersChange(nextShowOrders);
          if (nextShowOrders) onLoadSessionOrders();
        }}
        className="gap-0"
      >
        <TabsList
          aria-label="POS sidebar"
          className="grid h-auto grid-cols-2 rounded-lg border bg-card p-2"
        >
          <TabsTrigger value="new-order" className="gap-2 py-2.5 text-sm font-semibold">
            Đơn mới
            {cartQuantity > 0 && (
              <span className="rounded-full bg-primary-foreground/15 px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                {cartQuantity}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="active-orders"
            className="gap-2 py-2.5 text-sm font-semibold"
          >
            Đơn đang phục vụ
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}

export function PosSidebarContent({
  showOrders,
  cartItems,
  cartTotal,
  orderType,
  selectedTableId,
  tables,
  flowProgressPercent,
  flowHeadline,
  flowHint,
  canSubmit,
  isPending,
  sessionOrders,
  orderNote,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onOrderTypeChange,
  onRequestChangeTable,
  onSubmitOrder,
  onOrderNoteChange,
  onViewBill,
  onViewDetail,
  onLoadSessionOrders,
}: PosSidebarPanelProps) {
  if (showOrders) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Đơn đang phục vụ</span>
            {sessionOrders.length > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {sessionOrders.length}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 rounded-full px-3 text-xs"
            onClick={onLoadSessionOrders}
          >
            <DoorOpen className="mr-1 size-3.5" />
            Tải lại
          </Button>
        </div>
        <OrderHistory
          orders={sessionOrders}
          onViewBill={onViewBill}
          onViewDetail={onViewDetail}
        />
      </div>
    );
  }

  return (
    <CartSidebar
      items={cartItems}
      total={cartTotal}
      orderType={orderType}
      selectedTableId={selectedTableId}
      tables={tables}
      progressPercent={flowProgressPercent}
      progressHeadline={flowHeadline}
      progressHint={flowHint}
      canSubmit={canSubmit}
      isSubmitting={isPending}
      onUpdateQuantity={onUpdateQuantity}
      onRemoveItem={onRemoveItem}
      onClearCart={onClearCart}
      onOrderTypeChange={onOrderTypeChange}
      onRequestChangeTable={onRequestChangeTable}
      onSubmitOrder={onSubmitOrder}
      orderNote={orderNote}
      onOrderNoteChange={onOrderNoteChange}
    />
  );
}
