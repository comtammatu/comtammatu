"use client";

import { memo, type ComponentProps } from "react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  ClipboardList as IconClipboardList,
  ShoppingCart as IconShoppingCart,
} from "lucide-react";
import { PosSessionTopBar } from "../pos-session-header";
import { PosSidebarContent } from "../pos-sidebar-panel";
import { AppendDraftPane } from "./append-draft-pane";
import { CartPane } from "./cart-pane";
import { OrderListPane } from "./order-list-pane";
import { messages } from "@lib/messages";

type SidebarContentProps = ComponentProps<typeof PosSidebarContent>;

interface SidebarHeaderInputs {
  canCloseShift: boolean;
  canManageMenuLimits: boolean;
  onShowCloseSession: () => void;
  selfOrderInterrupt?: ComponentProps<
    typeof PosSessionTopBar
  >["selfOrderInterrupt"];
  voidInterrupt?: ComponentProps<typeof PosSessionTopBar>["voidInterrupt"];
}

export interface SplitSidebarProps extends SidebarHeaderInputs {
  isContextGate: boolean;
  sidebarContentProps: SidebarContentProps;
  onToggleShowOrders?: (show: boolean) => void;
  cartQuantity?: number;
  cartTotal?: number;
  ordersCount?: number;
}

/** Responsive sidebar: single sidebar on lg (1024px-1279px), dual pane on xl (1280px+). */
function SplitSidebarComponent({
  canCloseShift,
  canManageMenuLimits,
  onShowCloseSession,
  selfOrderInterrupt,
  voidInterrupt,
  isContextGate,
  sidebarContentProps,
  onToggleShowOrders,
  cartQuantity,
  ordersCount,
}: SplitSidebarProps) {
  const {
    canSubmit,
    isPending,
    appendDraft,
    onSubmitOrder,
    onCustomizeItem,
    onReturnToTables,
    onViewBill,
    onViewDetail,
    onOpenArchivedSheet,
    hideTakeawayOrders,
    paymentCallByOrderId,
  } = sidebarContentProps;

  const sessionTopBar = (
    <PosSessionTopBar
      canCloseShift={canCloseShift}
      canManageMenuLimits={canManageMenuLimits}
      onShowCloseSession={onShowCloseSession}
      selfOrderInterrupt={selfOrderInterrupt}
      voidInterrupt={voidInterrupt}
    />
  );

  const orderList = (
    <OrderListPane
      onViewBill={onViewBill}
      onViewDetail={onViewDetail}
      onOpenArchivedSheet={onOpenArchivedSheet}
      hideTakeawayOrders={hideTakeawayOrders}
      paymentCallByOrderId={paymentCallByOrderId}
    />
  );

  // min-h-0 + h-full: parent is overflow-hidden; without these the column
  // grows to content height and the bottom of order cards / cart CTAs clips.
  if (isContextGate) {
    return (
      <div className="hidden h-full min-h-0 w-80 shrink-0 flex-col border-l border-border/60 bg-background lg:flex 2xl:w-96">
        {sessionTopBar}
        {orderList}
      </div>
    );
  }

  const cartOrDraftPane =
    appendDraft.target != null ? (
      <AppendDraftPane
        targetLabel={appendDraft.target.targetLabel}
        items={appendDraft.items}
        isSubmitting={appendDraft.isSubmitting}
        onSubmit={appendDraft.onSubmit}
        onCancel={appendDraft.onCancel}
        onRemoveItem={appendDraft.onRemoveItem}
        onEditItem={appendDraft.onEditItem}
      />
    ) : (
      <CartPane
        canSubmit={canSubmit}
        isSubmitting={isPending}
        onSubmitOrder={onSubmitOrder}
        onCustomizeItem={onCustomizeItem}
        onReturnToTables={onReturnToTables}
      />
    );

  // Single sidebar for tablet landscape (lg: 1024px - 1279px):
  // Keeps menu width spacious while showing a dedicated sidebar with quick toggle.
  const singleTabletSidebar = (
    <div className="hidden h-full min-h-0 w-80 shrink-0 flex-col border-l border-border/60 bg-background lg:flex xl:hidden">
      {sessionTopBar}
      <div className="flex border-b border-border/60 bg-muted/30 p-1">
        <Button
          type="button"
          variant="ghost"
          size="touch"
          onClick={() => onToggleShowOrders?.(false)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-semibold",
            !sidebarContentProps.showOrders
              ? "bg-background text-foreground shadow-xs hover:bg-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <IconShoppingCart className="size-4" />
          <span>{messages.pos.mobileActionBar.newCart}</span>
          {cartQuantity != null && cartQuantity > 0 ? (
            <Badge
              variant="secondary"
              className="h-5 min-w-5 px-1.5 text-xs font-semibold tabular-nums"
            >
              {cartQuantity}
            </Badge>
          ) : null}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="touch"
          onClick={() => onToggleShowOrders?.(true)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-semibold",
            sidebarContentProps.showOrders
              ? "bg-background text-foreground shadow-xs hover:bg-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <IconClipboardList className="size-4" />
          <span>{messages.pos.mobileActionBar.sessionOrders}</span>
          {ordersCount != null && ordersCount > 0 ? (
            <Badge
              variant="secondary"
              className="h-5 min-w-5 px-1.5 text-xs font-semibold tabular-nums"
            >
              {ordersCount}
            </Badge>
          ) : null}
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {sidebarContentProps.showOrders ? orderList : cartOrDraftPane}
      </div>
    </div>
  );

  // Dual pane: keep session chrome (logo / printer / ⋮) only above the
  // order-list column so it does not span both panes and create a floating
  // logo cell with misaligned border crosses. xl uses w-72 so the menu
  // keeps two product columns; 2xl restores a wider cart and list.
  const dualDesktopSidebar = (
    <div className="hidden h-full min-h-0 shrink-0 flex-col border-l border-border/60 bg-background xl:flex">
      <div className="flex min-h-0 flex-1">
        <div className="flex h-full min-h-0 w-72 shrink-0 flex-col 2xl:w-80">
          {cartOrDraftPane}
        </div>
        <div className="flex h-full min-h-0 w-72 shrink-0 flex-col border-l border-border/60 2xl:w-88">
          {sessionTopBar}
          {orderList}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {singleTabletSidebar}
      {dualDesktopSidebar}
    </>
  );
}

export const SplitSidebar = memo(SplitSidebarComponent);
