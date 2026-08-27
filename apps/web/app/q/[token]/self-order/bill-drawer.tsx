"use client";

import { useState } from "react";
import {
  History as IconHistory,
  ReceiptText as IconReceipt,
  X as IconX,
} from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { ACTIONS_VI, SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";

import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import type { PublicSelfOrderAvailableSnapshot } from "@lib/self-order/contracts";
import { OrderRoundsList, OrderSummary } from "./order-summary";
import { SelfOrderPromoPanel } from "./promo-code-panel";
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
  onOpenPayment: () => void;
  paymentMethod?: "cash_call" | "vietqr" | null;
  canPay: boolean;
  tableNumber?: number;
  order: PublicSelfOrderAvailableSnapshot["order"];
  rounds?: PublicSelfOrderAvailableSnapshot["rounds"];
  pendingItems?: NonNullable<
    PublicSelfOrderAvailableSnapshot["request"]
  >["items"];
  promo?: {
    canEdit: boolean;
    isPending: boolean;
    error: string | null;
    onApply: (code: string) => void;
    onClear: () => void;
  };
}

export function BillDrawer({
  open,
  onOpenChange,
  onOpenPayment,
  paymentMethod = null,
  canPay,
  order,
  rounds = [],
  pendingItems,
  promo,
}: BillDrawerProps) {
  const [viewMode, setViewMode] = useState<"bill" | "history">("bill");
  const itemDiscount = Math.max(0, Number(order?.itemDiscountAmount ?? 0));
  const orderDiscount = Math.max(0, Number(order?.orderDiscountAmount ?? 0));
  const fallbackDiscount = Math.max(0, Number(order?.discountAmount ?? 0));
  const visibleItemDiscount = itemDiscount;
  const visibleOrderDiscount =
    order?.orderDiscountAmount != null || order?.itemDiscountAmount != null
      ? orderDiscount
      : fallbackDiscount;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        fullscreen
        className="mx-auto w-full max-w-2xl overflow-hidden p-0"
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <SheetHeader className="shrink-0 border-border bg-background bg-none">
            <div className="flex items-center gap-2">
              <SheetTitle className="flex-1">
                {viewMode === "history"
                  ? SELF_ORDER_VI.roundsHistoryTitle
                  : SELF_ORDER_VI.billTab}
              </SheetTitle>
              <Button
                type="button"
                variant={viewMode === "history" ? "secondary" : "outline"}
                size="xs"
                className="gap-1.5 text-xs font-medium"
                onClick={() =>
                  setViewMode((prev) =>
                    prev === "history" ? "bill" : "history",
                  )
                }
              >
                {viewMode === "history" ? (
                  <>
                    <IconReceipt className="size-3.5" />
                    <span>{SELF_ORDER_VI.billTab}</span>
                  </>
                ) : (
                  <>
                    <IconHistory className="size-3.5" />
                    <span>{SELF_ORDER_VI.roundsHistoryButton}</span>
                  </>
                )}
              </Button>
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
          <ScrollArea className="min-h-0 flex-1 overflow-hidden overscroll-contain">
            <div className="px-3 py-4 sm:px-4">
              {viewMode === "history" ? (
                <OrderRoundsList
                  rounds={rounds}
                  pendingItems={pendingItems}
                />
              ) : (
                <OrderSummary
                  pendingItems={pendingItems}
                  items={order?.items ?? []}
                />
              )}
            </div>
          </ScrollArea>
          {order?.totalAmount != null ? (
            <SheetFooter className="shrink-0 border-border bg-card p-4">
              {promo ? (
                <SelfOrderPromoPanel
                  promotionName={order.promotionName}
                  promotionCode={order.promotionCode}
                  orderDiscountAmount={visibleOrderDiscount}
                  canEdit={promo.canEdit}
                  isPending={promo.isPending}
                  error={promo.error}
                  onApply={promo.onApply}
                  onClear={promo.onClear}
                />
              ) : null}
              <div className="flex flex-col gap-2 text-sm">
                {Number(order.serviceCharge) > 0 ? (
                  <div className="flex items-center justify-between gap-3 text-muted-foreground">
                    <span>{SELF_ORDER_VI.serviceCharge}</span>
                    <span className="font-mono tabular-nums">
                      {formatVND(order.serviceCharge)}
                    </span>
                  </div>
                ) : null}
                {visibleItemDiscount > 0 ? (
                  <div className="flex items-center justify-between gap-3 text-success">
                    <span>{SELF_ORDER_VI.itemPromo}</span>
                    <span className="font-mono tabular-nums">
                      -{formatVND(visibleItemDiscount)}
                    </span>
                  </div>
                ) : null}
                {visibleOrderDiscount > 0 ? (
                  <div className="flex flex-col gap-1 text-success">
                    <div className="flex items-center justify-between gap-3">
                      <span>
                        {visibleItemDiscount > 0
                          ? SELF_ORDER_VI.orderPromo
                          : order.promotionName
                            ? SELF_ORDER_VI.orderPromo
                            : SELF_ORDER_VI.discount}
                      </span>
                      <span className="font-mono tabular-nums">
                        -{formatVND(visibleOrderDiscount)}
                      </span>
                    </div>
                    {order.discountNote ? (
                      <p className="text-xs italic text-muted-foreground">
                        {order.discountNote}
                      </p>
                    ) : null}
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
                  {paymentMethod === "vietqr"
                    ? SELF_ORDER_VI.vietQrPendingTitle
                    : SELF_ORDER_VI.paymentTitle}
                </Button>
              ) : null}
            </SheetFooter>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
