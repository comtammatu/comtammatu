"use client";

import type { ReactNode } from "react";
import { ArrowLeft as IconArrowLeft, X as IconX } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { ACTIONS_VI, SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";

import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import type { PublicSelfOrderAvailableSnapshot } from "@lib/self-order/contracts";
import { OrderSummary } from "./order-summary";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/surface/app-sheet";


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
        fullscreen
        className="mx-auto w-full max-w-2xl overflow-hidden p-0"
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
            <SheetClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-touch"
                  className="-mr-2 shrink-0"
                >
                  <IconX />
                  <span className="sr-only">{ACTIONS_VI.close}</span>
                </Button>
              }
            />
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
          <SheetFooter className="shrink-0 border-t border-border bg-card p-4">
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between gap-3 text-muted-foreground">
                <span>{SELF_ORDER_VI.subtotal}</span>
                <span className="font-mono tabular-nums">
                  {formatVND(order.subtotal)}
                </span>
              </div>
              {Number(order.serviceCharge) > 0 ? (
                <div className="flex items-center justify-between gap-3 text-muted-foreground">
                  <span>{SELF_ORDER_VI.serviceCharge}</span>
                  <span className="font-mono tabular-nums">
                    {formatVND(order.serviceCharge)}
                  </span>
                </div>
              ) : null}
              {Number(order.discountAmount) > 0 ? (
                <div className="flex items-center justify-between gap-3 text-success">
                  <span>{SELF_ORDER_VI.discount}</span>
                  <span className="font-mono tabular-nums">
                    -{formatVND(order.discountAmount)}
                  </span>
                </div>
              ) : null}
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-border/60 pt-2 text-base font-semibold">
                <span>{SELF_ORDER_VI.totalAmount}</span>
                <span className="font-mono text-xl tabular-nums text-primary">
                  {formatVND(order.totalAmount)}
                </span>
              </div>
            </div>
            {canPay ? (
              <Button
                type="button"
                size="touch-lg"
                className="w-full shadow-xs"
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
