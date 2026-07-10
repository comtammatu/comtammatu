"use client";

import type { ReactNode } from "react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@comtammatu/ui/components/drawer";
import type { PublicSelfOrderAvailableSnapshot } from "@lib/self-order/contracts";
import { OrderSummary } from "./order-summary";

interface BillDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableNumber: number;
  order: PublicSelfOrderAvailableSnapshot["order"];
  rounds: PublicSelfOrderAvailableSnapshot["rounds"];
  pendingItems?: NonNullable<
    PublicSelfOrderAvailableSnapshot["request"]
  >["items"];
  children?: ReactNode;
}

export function BillDrawer({
  open,
  onOpenChange,
  tableNumber,
  order,
  rounds,
  pendingItems,
  children,
}: BillDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-dvh-95">
        <DrawerHeader>
          <DrawerTitle>{SELF_ORDER_VI.billTab}</DrawerTitle>
          <DrawerDescription>
            {SELF_ORDER_VI.tableLabel(tableNumber)}
          </DrawerDescription>
        </DrawerHeader>
        <div className="workflow-safe-pb flex flex-col gap-3 overflow-y-auto px-3">
          <OrderSummary
            pendingItems={pendingItems}
            items={order?.items ?? []}
            rounds={rounds}
            totalAmount={order?.totalAmount}
          />
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
