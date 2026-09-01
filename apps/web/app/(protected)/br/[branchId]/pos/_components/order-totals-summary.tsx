"use client";

import { formatPercent, formatVND } from "@comtammatu/shared/format";
import { calculateHddtTotal } from "@comtammatu/shared/hddt";
import { FORM_VI, POS_VI } from "@comtammatu/shared/messages";
import { Separator } from "@comtammatu/ui/components/separator";
import { cn } from "@comtammatu/ui";

export interface OrderTotalsSummaryProps {
  subtotal: number;
  serviceCharge: number;
  discountAmount: number;
  orderDiscountAmount?: number;
  itemDiscountAmount?: number;
  discountType: "pct" | "vnd" | null;
  discountValue: number | null;
  discountNote: string | null;
  totalAmount: number;
  /** Compact mode removes separators and reduces type size for tight footers. */
  variant?: "default" | "compact";
  className?: string;
}

/**
 * Shared order total breakdown for the order detail and payment surfaces.
 * Keep its amount order aligned with BillReceiptSummary and printed bills.
 */
export function OrderTotalsSummary({
  subtotal,
  serviceCharge,
  discountAmount,
  orderDiscountAmount,
  itemDiscountAmount,
  discountType,
  discountValue,
  discountNote,
  totalAmount,
  variant = "default",
  className,
}: OrderTotalsSummaryProps) {
  const isCompact = variant === "compact";
  const lineClass = cn(
    "flex justify-between gap-2",
    isCompact ? "text-xs" : "text-sm",
  );
  const totalClass = cn(
    "flex justify-between gap-2 font-bold tabular-nums",
    isCompact ? "text-sm" : "text-base",
  );
  const hasSplitDiscountSource =
    orderDiscountAmount !== undefined || itemDiscountAmount !== undefined;
  const itemDiscount = Math.max(0, Number(itemDiscountAmount ?? 0));
  const orderDiscount = Math.max(
    0,
    Number(
      orderDiscountAmount ??
        (hasSplitDiscountSource
          ? discountAmount - itemDiscount
          : discountAmount),
    ),
  );
  const fallbackDiscount = Math.max(0, Number(discountAmount ?? 0));
  const visibleItemDiscount = hasSplitDiscountSource ? itemDiscount : 0;
  const visibleOrderDiscount = hasSplitDiscountSource
    ? orderDiscount
    : fallbackDiscount;
  const hddtTotal = calculateHddtTotal(totalAmount, serviceCharge);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className={cn(lineClass, "text-muted-foreground")}>
        <span>{FORM_VI.subtotal}</span>
        <span className="font-mono tabular-nums">{formatVND(subtotal)}</span>
      </div>

      {visibleItemDiscount > 0 && (
        <div className={cn(lineClass, "text-success")}>
          <span>{POS_VI.itemDiscountLabel}</span>
          <span className="font-mono tabular-nums">
            -{formatVND(visibleItemDiscount)}
          </span>
        </div>
      )}

      {visibleOrderDiscount > 0 && (
        <>
          <div className={cn(lineClass, "text-success")}>
            <span>
              {visibleItemDiscount > 0
                ? POS_VI.orderDiscountLabel
                : POS_VI.discountTitle}
              {discountType === "pct" && discountValue != null
                ? ` (${formatPercent(discountValue)})`
                : ""}
            </span>
            <span className="font-mono tabular-nums">
              -{formatVND(visibleOrderDiscount)}
            </span>
          </div>
          {discountNote && (
            <div className="text-xs italic text-muted-foreground">
              {POS_VI.reasonPrefix}
              {discountNote}
            </div>
          )}
        </>
      )}

      <Separator className="my-1" />

      {serviceCharge > 0 && (
        <>
          <div className={cn(lineClass, "font-semibold")}>
            <span>{POS_VI.hddtTotal}</span>
            <span className="font-mono tabular-nums">
              {formatVND(hddtTotal)}
            </span>
          </div>
          <div className={cn(lineClass, "text-muted-foreground")}>
            <span>{POS_VI.serviceChargeTitle}</span>
            <span className="font-mono tabular-nums">
              {formatVND(serviceCharge)}
            </span>
          </div>
          <Separator className="my-1" />
        </>
      )}

      <div className={totalClass}>
        <span>
          {serviceCharge > 0 ? POS_VI.paymentTotal : FORM_VI.totalAmount}
        </span>
        <span className="font-mono">{formatVND(totalAmount)}</span>
      </div>
    </div>
  );
}
