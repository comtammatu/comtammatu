"use client";

import { formatVND } from "@comtammatu/shared/format";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { Separator } from "@comtammatu/ui/components/separator";
import {
  BrandLockup,
  BRAND_LOCKUP_EYEBROW,
  BRAND_LOCKUP_NAME,
  BRAND_LOCKUP_TAGLINE,
} from "@/components/brand";
import { getPosLineItemDisplayName } from "../../types";
import { POS_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
import { METHOD_LABELS } from "./bill-receipt-types";
import type { OrderData } from "./bill-receipt-types";

interface BillReceiptSummaryProps {
  order: OrderData;
}

export function BillReceiptSummary({ order }: BillReceiptSummaryProps) {
  const isPaid =
    order.payment_status === "paid" || order.status === "completed";
  const itemDiscountAmount = Math.max(
    0,
    Number(order.item_discount_amount ?? 0),
  );
  const orderDiscountAmount = Math.max(
    0,
    Number(order.order_discount_amount ?? order.discount_amount ?? 0),
  );
  const paymentLabel =
    order.status === "cancelled"
      ? messages.pos.receipt.paymentCancelled
      : isPaid
        ? (METHOD_LABELS[order.payment_method ?? ""] ??
          order.payment_method ??
          messages.pos.receipt.paymentPaid)
        : messages.pos.receipt.paymentUnpaid;

  return (
    <div id="pos-receipt" className="px-4 py-3">
      <div className="text-center">
        <div className="flex justify-center print:hidden">
          <BrandLockup decorative size="sm" className="h-14" />
        </div>
        <div className="hidden print:block">
          <p className="font-heading text-xs font-semibold tracking-wide">
            {BRAND_LOCKUP_EYEBROW}
          </p>
          <h2 className="font-heading text-lg font-bold">
            {BRAND_LOCKUP_NAME}
          </h2>
          <p className="text-xs">{BRAND_LOCKUP_TAGLINE}</p>
        </div>
        {order.branches && (
          <>
            <p className="text-xs">{order.branches.name}</p>
            {order.branches.address && (
              <p className="break-words text-xs text-muted-foreground">
                {order.branches.address}
              </p>
            )}
            {order.branches.phone && (
              <p className="text-xs text-muted-foreground">
                {messages.pos.receipt.branchPhone(order.branches.phone)}
              </p>
            )}
          </>
        )}
      </div>

      <Separator className="my-2" />

      <div className="flex flex-col gap-1 text-xs">
        <div className="flex justify-between">
          <span>{messages.pos.receipt.order}</span>
          <span className="font-medium">#{order.order_number}</span>
        </div>
        <div className="flex justify-between">
          <span>{messages.pos.receipt.date}</span>
          <span>{formatVNDateTime(order.created_at)}</span>
        </div>
        <div className="flex justify-between">
          <span>{messages.pos.receipt.orderType}</span>
          <span>
            {order.order_type === "dine_in"
              ? messages.pos.receipt.dineIn
              : messages.pos.receipt.takeaway}
          </span>
        </div>
        {order.tables && (
          <div className="flex justify-between">
            <span>{messages.pos.receipt.table}</span>
            <span>{order.tables.number}</span>
          </div>
        )}
        {order.profiles?.full_name && (
          <div className="flex justify-between">
            <span>{messages.pos.receipt.cashier}</span>
            <span className="font-medium">{order.profiles.full_name}</span>
          </div>
        )}
        {order.split_from_order_id !== null && (
          <div className="flex justify-between">
            <span>{messages.pos.receipt.splitFrom}</span>
            <span className="font-mono text-muted-foreground">
              #{order.split_from_order_id}
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span>{messages.pos.receipt.payment}</span>
          <span className="font-medium">{paymentLabel}</span>
        </div>
      </div>

      <Separator className="my-2" />

      <div className="text-xs">
        <div className="flex items-center justify-between border-b pb-1 font-medium text-muted-foreground">
          <span>{messages.pos.receipt.item}</span>
          <span className="text-right">{messages.pos.receipt.amount}</span>
        </div>
        <div className="divide-y divide-dashed">
          {order.order_items.map((item) => {
            const displayName = getPosLineItemDisplayName(item);
            // unit_price = base + variant_adj + modifier_sum + sides_sum
            // (server-recomputed) → split it so every modifier/side shows
            // its own line amount; never lump them together.
            const modifierSum = item.modifiers.reduce(
              (sum, m) => sum + m.price,
              0,
            );
            const sidesSum = item.sides.reduce(
              (sum, s) => sum + s.price * s.quantity,
              0,
            );
            const baseUnit = item.unit_price - modifierSum - sidesSum;
            const baseTotal = baseUnit * item.quantity;
            const note = item.note?.trim();

            return (
              <div key={item.id} className="flex flex-col gap-1 py-2">
                <div className="flex gap-3">
                  <div className="min-w-0 flex-1 break-words font-medium leading-snug">
                    {displayName}
                  </div>
                  <div className="shrink-0 whitespace-nowrap text-right font-semibold tabular-nums">
                    {formatVND(baseTotal)}
                  </div>
                </div>
                <div className="text-right text-muted-foreground tabular-nums">
                  {messages.pos.receipt.lineUnitPrice(
                    item.quantity,
                    formatVND(baseUnit),
                  )}
                </div>
                {item.modifiers.map((m) => {
                  const modAmt = m.price > 0 ? m.price * item.quantity : 0;
                  return (
                    <div
                      key={`mod-${String(m.modifier_id)}`}
                      className="flex gap-3 text-muted-foreground"
                    >
                      <div className="min-w-0 flex-1 break-words leading-4">
                        + {m.name}
                      </div>
                      <div className="shrink-0 whitespace-nowrap text-right tabular-nums">
                        {modAmt > 0 ? formatVND(modAmt) : ""}
                      </div>
                    </div>
                  );
                })}
                {item.sides.map((s) => {
                  const totalSideQty = s.quantity * item.quantity;
                  const sideAmt =
                    s.price > 0 && totalSideQty > 0
                      ? s.price * totalSideQty
                      : 0;
                  return (
                    <div
                      key={`side-${String(s.side_item_id)}`}
                      className="flex gap-3 text-muted-foreground"
                    >
                      <div className="min-w-0 flex-1 break-words leading-4">
                        - {s.name}
                        {totalSideQty > 1 ? ` x${String(totalSideQty)}` : ""}
                      </div>
                      <div className="shrink-0 whitespace-nowrap text-right tabular-nums">
                        {sideAmt > 0 ? formatVND(sideAmt) : ""}
                      </div>
                    </div>
                  );
                })}
                {note && (
                  <div className="break-words italic leading-4 text-muted-foreground">
                    {messages.pos.receipt.note} {note}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Separator className="my-2" />

      <div className="flex flex-col gap-1 text-xs">
        <div className="flex justify-between">
          <span>{messages.pos.receipt.subtotal}</span>
          <span className="font-mono tabular-nums">
            {formatVND(order.subtotal)}
          </span>
        </div>
        {order.tax_amount > 0 && (
          <div className="flex justify-between">
            <span>{messages.pos.receipt.tax}</span>
            <span className="font-mono tabular-nums">
              {formatVND(order.tax_amount)}
            </span>
          </div>
        )}
        {order.service_charge > 0 && (
          <div className="flex justify-between">
            <span>{messages.pos.receipt.serviceCharge}</span>
            <span className="font-mono tabular-nums">
              {formatVND(order.service_charge)}
            </span>
          </div>
        )}
        {itemDiscountAmount > 0 && (
          <div className="flex justify-between">
            <span>{POS_VI.itemDiscountLabel}</span>
            <span className="font-mono tabular-nums">
              -{formatVND(itemDiscountAmount)}
            </span>
          </div>
        )}
        {orderDiscountAmount > 0 && (
          <div className="flex justify-between">
            <span>
              {itemDiscountAmount > 0
                ? POS_VI.orderDiscountLabel
                : messages.pos.receipt.discount}
              {order.discount_type === "pct" && order.discount_value != null
                ? ` (${order.discount_value}%)`
                : ""}
            </span>
            <span className="font-mono tabular-nums">
              -{formatVND(orderDiscountAmount)}
            </span>
          </div>
        )}
        {orderDiscountAmount > 0 && order.discount_note && (
          <div className="text-xs italic text-muted-foreground">
            {messages.pos.receipt.discountReason} {order.discount_note}
          </div>
        )}
        <Separator className="my-1" />
        <div className="flex justify-between text-sm font-bold">
          <span>{messages.pos.receipt.total}</span>
          <span className="font-mono tabular-nums">
            {formatVND(order.total_amount)}
          </span>
        </div>
        {isPaid &&
          order.payment_method === "cash" &&
          order.cash_received != null && (
            <>
              <Separator className="my-1" />
              <div className="flex justify-between">
                <span>{messages.pos.receipt.cashReceived}</span>
                <span className="font-mono tabular-nums">
                  {formatVND(order.cash_received)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{messages.pos.receipt.cashChange}</span>
                <span className="font-mono tabular-nums font-medium">
                  {formatVND(order.cash_change ?? 0)}
                </span>
              </div>
            </>
          )}
      </div>

      {order.note && (
        <>
          <Separator className="my-2" />
          <div className="break-words text-xs">
            <span className="font-medium">{messages.pos.receipt.note} </span>
            <span className="text-muted-foreground">{order.note}</span>
          </div>
        </>
      )}

      <Separator className="my-2" />

      <p className="text-center text-xs text-muted-foreground">
        {messages.pos.receipt.thanks}
      </p>
    </div>
  );
}
