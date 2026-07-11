"use client";

import type { ReactNode } from "react";
import { ArrowLeft as IconArrowLeft, X as IconX } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { ACTIONS_VI, SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import type { PublicSelfOrderAvailableSnapshot } from "@lib/self-order/contracts";
import { OrderSummary } from "./order-summary";

interface BillDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: "bill" | "payment";
  onOpenPayment: () => void;
  onBackToBill: () => void;
  canPay: boolean;
  tableNumber?: number;
  order: PublicSelfOrderAvailableSnapshot["order"];
  rounds?: PublicSelfOrderAvailableSnapshot["rounds"];
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
  order,
  pendingItems,
  children,
}: BillDrawerProps) {
  const paymentView = view === "payment" && order !== null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto flex h-dvh max-h-dvh w-full max-w-2xl flex-col overflow-hidden p-0 data-[side=bottom]:h-dvh data-[side=bottom]:max-h-dvh"
      >
        <SheetHeader className="shrink-0">
          <div className="flex items-center gap-2">
            {paymentView ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-touch"
                className="-ml-2 shrink-0"
                onClick={onBackToBill}
              >
                <IconArrowLeft />
                <span className="sr-only">{SELF_ORDER_VI.billTab}</span>
              </Button>
            ) : null}
            <SheetTitle className="flex-1">
              {paymentView ? SELF_ORDER_VI.paymentTitle : SELF_ORDER_VI.billTab}
            </SheetTitle>
            <SheetClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-touch"
                className="-mr-2 shrink-0"
              >
                <IconX />
                <span className="sr-only">{ACTIONS_VI.close}</span>
              </Button>
            </SheetClose>
          </div>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-3 py-4 sm:px-4">
            {paymentView ? (
              children
            ) : (
              <OrderSummary
                pendingItems={pendingItems}
                items={order?.items ?? []}
              />
            )}
          </div>
        </ScrollArea>
        {!paymentView && order?.totalAmount != null ? (
          <SheetFooter className="workflow-safe-pb shrink-0">
            <div className="flex flex-col gap-1.5 text-sm">
              <p className="font-semibold">{SELF_ORDER_VI.total}</p>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">
                  {SELF_ORDER_VI.subtotal}
                </span>
                <span className="font-mono tabular-nums">
                  {formatVND(order.subtotal)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">
                  {SELF_ORDER_VI.serviceCharge}
                </span>
                <span className="font-mono tabular-nums">
                  {formatVND(order.serviceCharge)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">
                  {SELF_ORDER_VI.discount}
                </span>
                <span className="font-mono tabular-nums">
                  {order.discountAmount > 0 ? "-" : ""}
                  {formatVND(order.discountAmount)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 border-t pt-2 font-semibold">
                <span>{SELF_ORDER_VI.totalAmount}</span>
                <span className="font-mono tabular-nums text-primary">
                  {formatVND(order.totalAmount)}
                </span>
              </div>
            </div>
            {canPay ? (
            <Button
              type="button"
              size="touch"
              className="w-full"
              onClick={onOpenPayment}
            >
              {SELF_ORDER_VI.paymentTitle}
            </Button>
            ) : null}
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
