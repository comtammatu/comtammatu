"use client";

import type { ReactNode } from "react";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
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
  view: "bill" | "payment";
  onOpenPayment: () => void;
  onBackToBill: () => void;
  canPay: boolean;
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
  view,
  onOpenPayment,
  onBackToBill,
  canPay,
  tableNumber,
  order,
  rounds,
  pendingItems,
  children,
}: BillDrawerProps) {
  const paymentView = view === "payment" && order !== null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-dvh-95">
        <DrawerHeader>
          {paymentView ? (
            <Button
              type="button"
              variant="ghost"
              size="touch"
              className="-ml-3 self-start px-3"
              onClick={onBackToBill}
            >
              <IconArrowLeft data-icon="inline-start" />
              {SELF_ORDER_VI.billTab}
            </Button>
          ) : null}
          <DrawerTitle>
            {paymentView ? SELF_ORDER_VI.paymentTitle : SELF_ORDER_VI.billTab}
          </DrawerTitle>
          <DrawerDescription>
            {SELF_ORDER_VI.tableLabel(tableNumber)}
          </DrawerDescription>
        </DrawerHeader>
        <div className="workflow-safe-pb flex flex-col gap-3 overflow-y-auto px-3">
          {paymentView ? (
            children
          ) : (
            <>
              <OrderSummary
                pendingItems={pendingItems}
                items={order?.items ?? []}
                rounds={rounds}
                totalAmount={order?.totalAmount}
              />
              {canPay ? (
                <Button type="button" size="touch" onClick={onOpenPayment}>
                  {SELF_ORDER_VI.paymentTitle}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
