"use client";

import { memo, type ComponentProps } from "react";
import { PosSessionTopBar } from "../pos-session-header";
import { PosSidebarContent } from "../pos-sidebar-panel";
import { AppendDraftPane } from "./append-draft-pane";
import { CartPane } from "./cart-pane";
import { OrderListPane } from "./order-list-pane";

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
}

/** Wide layout (xl+): cart + order-list side by side. */
function SplitSidebarComponent({
  canCloseShift,
  canManageMenuLimits,
  onShowCloseSession,
  selfOrderInterrupt,
  voidInterrupt,
  isContextGate,
  sidebarContentProps,
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
      <div className="hidden h-full min-h-0 w-80 shrink-0 flex-col border-l border-border/60 bg-background xl:flex 2xl:w-96">
        {sessionTopBar}
        {orderList}
      </div>
    );
  }

  // Dual pane: keep session chrome (logo / printer / ⋮) only above the
  // order-list column so it does not span both panes and create a floating
  // logo cell with misaligned border crosses. xl uses w-72 so the menu
  // keeps two product columns; 2xl restores a wider cart and list.
  return (
    <div className="hidden h-full min-h-0 shrink-0 flex-col border-l border-border/60 bg-background xl:flex">
      <div className="flex min-h-0 flex-1">
        <div className="flex h-full min-h-0 w-72 shrink-0 flex-col 2xl:w-80">
          {appendDraft.target != null ? (
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
          )}
        </div>
        <div className="flex h-full min-h-0 w-72 shrink-0 flex-col border-l border-border/60 2xl:w-88">
          {sessionTopBar}
          {orderList}
        </div>
      </div>
    </div>
  );
}

export const SplitSidebar = memo(SplitSidebarComponent);
