"use client";

import { memo, type ComponentProps } from "react";
import { PosSessionHeader } from "../pos-session-header";
import { PosSidebarContent, PosSidebarTabs } from "../pos-sidebar-panel";
import { AppendDraftPane } from "./append-draft-pane";
import { CartPane } from "./cart-pane";
import { OrderListPane } from "./order-list-pane";

type SidebarContentProps = ComponentProps<typeof PosSidebarContent>;

interface SidebarHeaderInputs {
  canCloseShift: boolean;
  onShowCloseSession: () => void;
}

export interface TabbedSidebarProps extends SidebarHeaderInputs {
  isContextGate: boolean;
  showOrders: boolean;
  onShowOrdersChange: (show: boolean) => void;
  sidebarContentProps: SidebarContentProps;
}

/** Tablet-class layout (md through lg-1): tabs-based sidebar. */
function TabbedSidebarComponent({
  canCloseShift,
  onShowCloseSession,
  isContextGate,
  showOrders,
  onShowOrdersChange,
  sidebarContentProps,
}: TabbedSidebarProps) {
  const contentProps = isContextGate
    ? { ...sidebarContentProps, showOrders: true }
    : sidebarContentProps;

  return (
    <div className="hidden w-80 shrink-0 flex-col border-l border-border/60 bg-background md:flex lg:hidden">
      <PosSessionHeader
        canCloseShift={canCloseShift}
        onShowCloseSession={onShowCloseSession}
      />
      {!isContextGate && sidebarContentProps.appendDraft.target == null && (
        <PosSidebarTabs
          showOrders={showOrders}
          onShowOrdersChange={onShowOrdersChange}
        />
      )}
      <PosSidebarContent {...contentProps} />
    </div>
  );
}

export const TabbedSidebar = memo(TabbedSidebarComponent);

export interface SplitSidebarProps extends SidebarHeaderInputs {
  isContextGate: boolean;
  sidebarContentProps: SidebarContentProps;
}

/** Wide layout (lg+): cart + order-list side by side. */
function SplitSidebarComponent({
  canCloseShift,
  onShowCloseSession,
  isContextGate,
  sidebarContentProps,
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

  if (isContextGate) {
    return (
      <div className="hidden w-80 shrink-0 flex-col border-l border-border/60 bg-background lg:flex xl:w-96">
        <PosSessionHeader
          canCloseShift={canCloseShift}
          onShowCloseSession={onShowCloseSession}
        />
        <OrderListPane
          onViewBill={onViewBill}
          onViewDetail={onViewDetail}
          onOpenArchivedSheet={onOpenArchivedSheet}
          hideTakeawayOrders={hideTakeawayOrders}
        />
      </div>
    );
  }

  return (
    <div className="hidden shrink-0 flex-col border-l border-border/60 bg-background lg:flex">
      <PosSessionHeader
        canCloseShift={canCloseShift}
        onShowCloseSession={onShowCloseSession}
      />
      <div className="flex min-h-0 flex-1">
        <div className="flex w-72 shrink-0 flex-col xl:w-80 2xl:w-96">
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
        <div className="flex w-72 shrink-0 flex-col border-l border-border/60 xl:w-80 2xl:w-96">
          <OrderListPane
            onViewBill={onViewBill}
            onViewDetail={onViewDetail}
            onOpenArchivedSheet={onOpenArchivedSheet}
            hideTakeawayOrders={hideTakeawayOrders}
          />
        </div>
      </div>
    </div>
  );
}

export const SplitSidebar = memo(SplitSidebarComponent);
