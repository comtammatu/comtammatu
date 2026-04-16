"use client";

import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { DoorOpen } from "lucide-react";
import { CartSidebar } from "./cart-sidebar";
import { OrderHistory } from "./order-history";
import type { CartItem, OrderType } from "./types";
import type { BranchTable } from "./page";
import type { SessionOrder } from "./order-history";
import type { PosFlowStep } from "./pos-menu-types";

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
  flowSteps: readonly PosFlowStep[];
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
  cartItems,
  cartQuantity,
  onLoadSessionOrders,
}: Pick<
  PosSidebarPanelProps,
  | "showOrders"
  | "onShowOrdersChange"
  | "cartItems"
  | "cartQuantity"
  | "onLoadSessionOrders"
>) {
  return (
    <div className="border-b border-border/60 px-3 py-3">
      <div
        role="tablist"
        aria-label="POS sidebar"
        className="rounded-lg border bg-card shadow-sm grid grid-cols-2 gap-2 p-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected={!showOrders}
          className={cn(
            "min-h-11 min-w-11 flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-semibold transition-all",
            !showOrders
              ? "border-primary/30 bg-primary text-primary-foreground shadow-sm"
              : "border-border/70 bg-background/80 text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onShowOrdersChange(false)}
        >
          Giỏ hàng
          {cartItems.length > 0 && (
            <span className="rounded-full bg-primary-foreground/15 px-2 py-0.5 text-xs font-semibold text-primary-foreground">
              {cartQuantity}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={showOrders}
          className={cn(
            "min-h-11 min-w-11 flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-semibold transition-all",
            showOrders
              ? "border-primary/30 bg-primary text-primary-foreground shadow-sm"
              : "border-border/70 bg-background/80 text-muted-foreground hover:text-foreground",
          )}
          onClick={() => {
            onShowOrdersChange(true);
            onLoadSessionOrders();
          }}
        >
          Đơn hàng
        </button>
      </div>
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
  flowSteps,
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
            <span className="font-semibold">Đơn hàng</span>
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
      steps={flowSteps}
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
