"use client";

import { memo, type ComponentProps } from "react";
import { PosSessionHeader } from "../pos-session-header";
import { PosSidebarContent, PosSidebarTabs } from "../pos-sidebar-panel";
import { CartPane } from "./cart-pane";
import { OrderListPane } from "./order-list-pane";
import type { ActiveSession } from "../page";

type SidebarContentProps = ComponentProps<typeof PosSidebarContent>;

interface SidebarHeaderInputs {
  session: ActiveSession;
  canCloseShift: boolean;
  onShowCloseSession: () => void;
}

export interface TabbedSidebarProps extends SidebarHeaderInputs {
  showOrders: boolean;
  onShowOrdersChange: (show: boolean) => void;
  sidebarContentProps: SidebarContentProps;
}

/** Tablet-class layout (md through xl-1): tabs-based sidebar. */
function TabbedSidebarComponent({
  session,
  canCloseShift,
  onShowCloseSession,
  showOrders,
  onShowOrdersChange,
  sidebarContentProps,
}: TabbedSidebarProps) {
  return (
    <div className="hidden w-96 shrink-0 flex-col border-l border-border/60 bg-background md:flex xl:hidden">
      <PosSessionHeader
        session={session}
        canCloseShift={canCloseShift}
        onShowCloseSession={onShowCloseSession}
      />
      <PosSidebarTabs
        showOrders={showOrders}
        onShowOrdersChange={onShowOrdersChange}
      />
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
  session,
  canCloseShift,
  onShowCloseSession,
  sidebarContentProps,
}: SplitSidebarProps) {
  const {
    canSubmit,
    isPending,
    onSubmitOrder,
    onOrderTypeChange,
    onCustomizeItem,
    onReturnToTables,
    onViewBill,
    onViewDetail,
  } = sidebarContentProps;

  return (
    <div className="hidden shrink-0 flex-col border-l border-border/60 bg-background xl:flex">
      <PosSessionHeader
        session={session}
        canCloseShift={canCloseShift}
        onShowCloseSession={onShowCloseSession}
      />
      <div className="flex min-h-0 flex-1">
        <div className="flex w-96 shrink-0 flex-col">
          <CartPane
            canSubmit={canSubmit}
            isSubmitting={isPending}
            onSubmitOrder={onSubmitOrder}
            onOrderTypeChange={onOrderTypeChange}
            onCustomizeItem={onCustomizeItem}
            onReturnToTables={onReturnToTables}
          />
        </div>
        <div className="flex w-80 shrink-0 flex-col border-l border-border/60 2xl:w-96">
          <OrderListPane onViewBill={onViewBill} onViewDetail={onViewDetail} />
        </div>
      </div>
    </div>
  );
}

export const SplitSidebar = memo(SplitSidebarComponent);
