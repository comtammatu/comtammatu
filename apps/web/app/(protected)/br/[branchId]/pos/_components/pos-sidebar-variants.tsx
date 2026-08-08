"use client";

import { memo, type ComponentProps, type ReactNode } from "react";
import { PosSessionTopBar } from "../pos-session-header";
import { PosSidebarContent } from "../pos-sidebar-panel";
import { AppendDraftPane } from "./append-draft-pane";
import { CartPane } from "./cart-pane";
import { OrderListPane } from "./order-list-pane";

type SidebarContentProps = ComponentProps<typeof PosSidebarContent>;

interface SidebarHeaderInputs {
  canCloseShift: boolean;
  onShowCloseSession: () => void;
}

export interface SplitSidebarProps extends SidebarHeaderInputs {
  isContextGate: boolean;
  sidebarContentProps: SidebarContentProps;
  sessionAction?: ReactNode;
}

/** Wide layout (xl+): cart + order-list side by side. */
function SplitSidebarComponent({
  canCloseShift,
  onShowCloseSession,
  isContextGate,
  sidebarContentProps,
  sessionAction,
}: SplitSidebarProps) {
  const {
    canSubmit,
    isPending,
    appendDraft,
    onSubmitOrder,
    onOrderTypeChange,
    onCustomizeItem,
    onReturnToTables,
    onViewBill,
    onViewDetail,
    onOpenArchivedSheet,
    hideTakeawayOrders,
  } = sidebarContentProps;

  const sessionTopBar = (
    <PosSessionTopBar
      canCloseShift={canCloseShift}
      onShowCloseSession={onShowCloseSession}
    />
  );

  const orderList = (
    <OrderListPane
      onViewBill={onViewBill}
      onViewDetail={onViewDetail}
      onOpenArchivedSheet={onOpenArchivedSheet}
      hideTakeawayOrders={hideTakeawayOrders}
    />
  );

  // min-h-0 + h-full: parent is overflow-hidden; without these the column
  // grows to content height and the bottom of order cards / cart CTAs clips.
  if (isContextGate) {
    return (
      <div className="hidden h-full min-h-0 w-80 shrink-0 flex-col border-l border-border/60 bg-background xl:flex 2xl:w-96">
        {sessionTopBar}
        {sessionAction ? (
          <div className="flex shrink-0 justify-end px-3 py-2">
            {sessionAction}
          </div>
        ) : null}
        {orderList}
      </div>
    );
  }

  // Dual pane: keep session chrome (logo / printer / ⋮) only above the
  // order-list column so it does not span both panes and create a floating
  // logo cell with misaligned border crosses.
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
              onOrderTypeChange={onOrderTypeChange}
              onCustomizeItem={onCustomizeItem}
              onReturnToTables={onReturnToTables}
            />
          )}
        </div>
        <div className="flex h-full min-h-0 w-72 shrink-0 flex-col border-l border-border/60 2xl:w-80">
          {sessionTopBar}
          {sessionAction ? (
            <div className="flex shrink-0 justify-end px-3 py-2">
              {sessionAction}
            </div>
          ) : null}
          {orderList}
        </div>
      </div>
    </div>
  );
}

export const SplitSidebar = memo(SplitSidebarComponent);
