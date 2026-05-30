"use client";

import { memo, type ComponentProps } from "react";
import type { MenuLimitRow } from "../../menu-limits/actions";
import { PosSessionHeader } from "../pos-session-header";
import { PosSidebarContent, PosSidebarTabs } from "../pos-sidebar-panel";
import { AppendDraftPane } from "./append-draft-pane";
import { CartPane } from "./cart-pane";
import { OrderListPane } from "./order-list-pane";

type SidebarContentProps = ComponentProps<typeof PosSidebarContent>;

interface SidebarHeaderInputs {
  canCloseShift: boolean;
  canManageMenuLimits: boolean;
  menuLimitRows: MenuLimitRow[];
  onShowCloseSession: () => void;
}

export interface TabbedSidebarProps extends SidebarHeaderInputs {
  showOrders: boolean;
  onShowOrdersChange: (show: boolean) => void;
  sidebarContentProps: SidebarContentProps;
}

/** Tablet-class layout (md through xl-1): tabs-based sidebar. */
function TabbedSidebarComponent({
  canCloseShift,
  canManageMenuLimits,
  menuLimitRows,
  onShowCloseSession,
  showOrders,
  onShowOrdersChange,
  sidebarContentProps,
}: TabbedSidebarProps) {
  return (
    <div className="hidden w-96 shrink-0 flex-col border-l border-border/60 bg-background md:flex xl:hidden">
      <PosSessionHeader
        canCloseShift={canCloseShift}
        canManageMenuLimits={canManageMenuLimits}
        menuLimitRows={menuLimitRows}
        onShowCloseSession={onShowCloseSession}
      />
      {sidebarContentProps.appendDraft.target == null && (
        <PosSidebarTabs
          showOrders={showOrders}
          onShowOrdersChange={onShowOrdersChange}
        />
      )}
      <PosSidebarContent {...sidebarContentProps} />
    </div>
  );
}

export const TabbedSidebar = memo(TabbedSidebarComponent);

export interface SplitSidebarProps extends SidebarHeaderInputs {
  sidebarContentProps: SidebarContentProps;
}

/** Wide-desktop layout (xl+): cart + order-list side by side. */
function SplitSidebarComponent({
  canCloseShift,
  canManageMenuLimits,
  menuLimitRows,
  onShowCloseSession,
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
  } = sidebarContentProps;

  return (
    <div className="hidden shrink-0 flex-col border-l border-border/60 bg-background xl:flex">
      <PosSessionHeader
        canCloseShift={canCloseShift}
        canManageMenuLimits={canManageMenuLimits}
        menuLimitRows={menuLimitRows}
        onShowCloseSession={onShowCloseSession}
      />
      <div className="flex min-h-0 flex-1">
        <div className="flex w-96 shrink-0 flex-col">
          {appendDraft.target != null ? (
            <AppendDraftPane
              orderNumber={appendDraft.target.orderNumber}
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
        <div className="flex w-80 shrink-0 flex-col border-l border-border/60 2xl:w-96">
          <OrderListPane
            onViewBill={onViewBill}
            onViewDetail={onViewDetail}
            onOpenArchivedSheet={onOpenArchivedSheet}
          />
        </div>
      </div>
    </div>
  );
}

export const SplitSidebar = memo(SplitSidebarComponent);
