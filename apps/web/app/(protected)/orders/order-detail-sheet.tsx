"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: baseline inline Vietnamese copy in order detail sheet */

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";
import { cn } from "@comtammatu/ui";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import {
  fetchOrderAuditLog,
  fetchOrderItems,
  type OrderAuditEntry,
  type OrderItem,
  type OrderItemModifier,
  type OrderItemSide,
  type OrderRow,
} from "./actions";

/* ─── Helpers ─── */

import {
  BRANCH_VI,
  FORM_VI,
  ORDERS_VI,
  POS_VI,
  STATES_VI,
} from "@comtammatu/shared/messages";
import { getPaymentMethodLabelVi } from "@comtammatu/shared/labels";
import { StatusBadge } from "@/components/status-badge";
import { DescriptionList } from "@/components/surface";

function itemStatusToneClass(status: string): string {
  switch (status) {
    case "pending":
    case "preparing":
      return "border-warning/30 bg-warning/5";
    case "ready":
      return "border-success/30 bg-success/5";
    case "served":
      return "border-success/30 bg-success/5";
    case "cancelled":
      return "border-destructive/40 bg-destructive/5 border-dashed";
    default:
      return "bg-card";
  }
}

function formatModifier(m: OrderItemModifier): string {
  return m.price > 0 ? `${m.name} (+${formatVND(m.price)})` : m.name;
}

function formatSide(s: OrderItemSide): string {
  const qty = s.quantity ?? 1;
  const qtySuffix = qty > 1 ? ` x${qty}` : "";
  const totalPrice = s.price * qty;
  return totalPrice > 0
    ? `${s.name}${qtySuffix} (+${formatVND(totalPrice)})`
    : `${s.name}${qtySuffix}`;
}
/* ─── Props ─── */

interface OrderDetailSheetProps {
  order: OrderRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Shared detail body (metadata + payment + items + totals + audit timeline)
 * for both the <xl slide-over Sheet and the xl:+ inline master-detail column
 * (`OrdersClient`) — one data-fetching/rendering path, two mount points.
 */
export function OrderDetailContent({ order }: { order: OrderRow }) {
  const [audit, setAudit] = useState<OrderAuditEntry[] | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditPending, startAuditTransition] = useTransition();
  const [items, setItems] = useState<OrderItem[] | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [itemsPending, startItemsTransition] = useTransition();

  const orderId = order.id;

  // Fetch the audit timeline. Extracted as a callback so the mount effect
  // and the realtime callback share it without stale closures.
  const loadAudit = useCallback((id: number) => {
    startAuditTransition(async () => {
      const result = await fetchOrderAuditLog(id);
      if (result.success && result.data) {
        setAudit(result.data);
        setAuditError(null);
      } else {
        setAuditError(result.error ?? ORDERS_VI.loadHistoryFailed);
      }
    });
  }, []);

  // The list view omits items to keep the payload small — loaded on demand.
  // order_items is intentionally NOT in the realtime publication; we
  // piggyback on order_status_history (the same RPC writes both) to refresh.
  const loadItems = useCallback((id: number) => {
    startItemsTransition(async () => {
      const result = await fetchOrderItems(id);
      if (result.success && result.data) {
        setItems(result.data);
        setItemsError(null);
      } else {
        setItemsError(result.error ?? ORDERS_VI.loadItemsFailed);
      }
    });
  }, []);

  // Fetch on mount and whenever the active order changes. This component is
  // mounted only while its host (Sheet or the xl:+ inline detail column) is
  // showing an order, so mount/order-change IS the "open" signal — reset
  // first so the previous order's data never shows stale.
  useEffect(() => {
    setAudit(null);
    setAuditError(null);
    setItems(null);
    setItemsError(null);
    loadAudit(orderId);
    loadItems(orderId);
  }, [orderId, loadAudit, loadItems]);

  // Realtime: a cashier on another terminal cancels/edits/serves → INSERT
  // into order_status_history. Subscribing with filter `order_id=eq.X` keeps
  // the timeline fresh without closing/reopening the host. Migration
  // 20260520010000_audit_log_completeness.sql added the table to the
  // supabase_realtime publication; order_items is not in the publication
  // (see 20260428000000_pos_realtime_publication.sql) so we refetch it too.
  useRealtimeChannel(
    (supabase) =>
      supabase
        .channel(`admin-order-audit-${String(orderId)}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "order_status_history",
            filter: `order_id=eq.${String(orderId)}`,
          },
          () => {
            loadAudit(orderId);
            loadItems(orderId);
          },
        )
        .subscribe(),
    [orderId, loadAudit, loadItems],
  );

  const hasDiscount = order.discount_amount > 0;
  const hasTax = order.tax_amount > 0;
  const hasServiceCharge = order.service_charge > 0;

  return (
    <>
      {/* ─── Order info ─── */}
      <div className="flex flex-col gap-4">
        <DescriptionList
          className="text-sm flex flex-col gap-2 [&>div]:flex [&>div]:flex-row [&>div]:justify-between [&>div]:items-center sm:grid sm:grid-cols-2 sm:gap-x-4 sm:gap-y-2 sm:[&>div]:flex-col sm:[&>div]:items-start"
          items={[
            {
              term: FORM_VI.status,
              description: <StatusBadge domain="order" value={order.status} />,
            },
            {
              term: BRANCH_VI.long,
              description: order.branch_name,
            },
            {
              term: ORDERS_VI.orderedBy,
              description: order.created_by_name,
            },
            {
              term: ORDERS_VI.time,
              description: formatVNDateTime(order.created_at),
            },
            {
              term: ORDERS_VI.orderType,
              description: (
                <span className="capitalize">{order.order_type}</span>
              ),
            },
          ]}
        />

        {/* ─── Payment info ─── */}
        {order.payment && (
          <div className="rounded-md border p-3 flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {ORDERS_VI.payment}
            </p>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {getPaymentMethodLabelVi(order.payment.method)}
                </Badge>
                <StatusBadge domain="payment" value={order.payment.status} />
              </div>
              <span className="font-mono font-medium">
                {formatVND(order.payment.amount)}
              </span>
            </div>
          </div>
        )}

        {!order.payment && order.payment_method && (
          <div className="rounded-md border p-3 flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {ORDERS_VI.payment}
            </p>
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="outline">
                {getPaymentMethodLabelVi(order.payment_method)}
              </Badge>
              {order.payment_status && (
                <StatusBadge
                  domain="order-payment"
                  value={order.payment_status}
                />
              )}
            </div>
          </div>
        )}

        {/* ─── Items ─── */}
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Món gọi{items ? ` (${items.length})` : ""}
            </p>
            {items && items.some((i) => i.status === "cancelled") && (
              <p className="text-xs text-muted-foreground">
                Có {items.filter((i) => i.status === "cancelled").length} món đã
                hủy
              </p>
            )}
          </div>
          {itemsError && (
            <p className="mb-2 text-sm text-destructive">{itemsError}</p>
          )}
          {!itemsError && items === null && itemsPending && (
            <div className="rounded-md border px-4 py-6 text-center text-sm text-muted-foreground">
              {ORDERS_VI.loadingItems}
            </div>
          )}
          {!itemsError && items !== null && items.length === 0 && (
            <div className="rounded-md border px-4 py-6 text-center text-sm text-muted-foreground">
              {ORDERS_VI.noItems}
            </div>
          )}
          {!itemsError && items !== null && items.length > 0 && (
            <ul className="flex flex-col gap-2">
              {items.map((item) => {
                const isCancelled = item.status === "cancelled";
                const modifierLine =
                  item.modifiers.length > 0
                    ? `Tuỳ chọn: ${item.modifiers.map(formatModifier).join(", ")}`
                    : null;
                const sideLine =
                  item.sides.length > 0
                    ? `Kèm: ${item.sides.map(formatSide).join(", ")}`
                    : null;
                return (
                  <li
                    key={item.id}
                    className={cn(
                      "rounded-md border p-3 transition-colors",
                      itemStatusToneClass(item.status),
                    )}
                  >
                    {/* Top row: name + status badge ↔ qty × price */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "text-sm font-semibold",
                              isCancelled &&
                                "line-through text-muted-foreground",
                            )}
                          >
                            {item.item_name}
                          </span>
                          <StatusBadge
                            domain="order-item"
                            value={item.status}
                            className="h-5 px-1.5 text-xs font-semibold uppercase tracking-wide"
                          />
                        </div>
                        {item.variant_name && (
                          <p
                            className={cn(
                              "mt-1 text-xs text-muted-foreground",
                              isCancelled && "line-through",
                            )}
                          >
                            {item.variant_name}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={cn(
                            "font-mono text-sm font-semibold",
                            isCancelled && "line-through text-muted-foreground",
                          )}
                        >
                          {formatVND(item.subtotal)}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {item.quantity} × {formatVND(item.unit_price)}
                        </p>
                      </div>
                    </div>

                    {/* Detail rows: modifiers / sides / note / cancel reason */}
                    {(modifierLine ||
                      sideLine ||
                      item.note ||
                      (isCancelled && item.cancel_reason)) && (
                      <DescriptionList
                        className="mt-2 border-t pt-2 text-xs flex flex-col gap-1 [&>div]:flex [&>div]:flex-row [&>div]:justify-between [&>div]:items-center sm:[&>div]:justify-start sm:[&>div]:gap-2"
                        items={[
                          ...(modifierLine
                            ? [
                                {
                                  term: (
                                    <span
                                      className={cn(
                                        isCancelled &&
                                          "line-through opacity-70",
                                      )}
                                    >
                                      {POS_VI.options}
                                    </span>
                                  ),
                                  description: (
                                    <span
                                      className={cn(
                                        isCancelled &&
                                          "line-through opacity-70",
                                      )}
                                    >
                                      {item.modifiers
                                        .map(formatModifier)
                                        .join(", ")}
                                    </span>
                                  ),
                                },
                              ]
                            : []),
                          ...(sideLine
                            ? [
                                {
                                  term: (
                                    <span
                                      className={cn(
                                        isCancelled &&
                                          "line-through opacity-70",
                                      )}
                                    >
                                      {ORDERS_VI.sidesLabel}
                                    </span>
                                  ),
                                  description: (
                                    <span
                                      className={cn(
                                        isCancelled &&
                                          "line-through opacity-70",
                                      )}
                                    >
                                      {item.sides.map(formatSide).join(", ")}
                                    </span>
                                  ),
                                },
                              ]
                            : []),
                          ...(item.note
                            ? [
                                {
                                  term: (
                                    <span
                                      className={cn(
                                        isCancelled &&
                                          "line-through opacity-70",
                                      )}
                                    >
                                      {FORM_VI.notes}
                                    </span>
                                  ),
                                  description: (
                                    <span
                                      className={cn(
                                        isCancelled &&
                                          "line-through opacity-70",
                                      )}
                                    >
                                      {item.note}
                                    </span>
                                  ),
                                },
                              ]
                            : []),
                          ...(isCancelled && item.cancel_reason
                            ? [
                                {
                                  term: (
                                    <span className="text-destructive">
                                      {ORDERS_VI.cancelReasonLabel}
                                    </span>
                                  ),
                                  description: item.cancel_reason,
                                },
                              ]
                            : []),
                        ]}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ─── Totals ─── */}
        <div className="rounded-md border p-3 flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{FORM_VI.subtotal}</span>
            <span className="font-mono">{formatVND(order.subtotal)}</span>
          </div>
          {hasDiscount && (
            <div className="text-success flex justify-between">
              <span>{ORDERS_VI.discountLabel}</span>
              <span className="font-mono">
                -{formatVND(order.discount_amount)}
              </span>
            </div>
          )}
          {hasTax && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{FORM_VI.tax}</span>
              <span className="font-mono">{formatVND(order.tax_amount)}</span>
            </div>
          )}
          {hasServiceCharge && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {ORDERS_VI.surchargeLabel}
              </span>
              <span className="font-mono">
                {formatVND(order.service_charge)}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 font-semibold">
            <span>{FORM_VI.totalAmount}</span>
            <span className="font-mono">{formatVND(order.total_amount)}</span>
          </div>
        </div>

        {/* ─── Audit timeline ─── */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {ORDERS_VI.auditHistoryTitle}
          </p>
          {auditPending && (
            <p className="text-sm text-muted-foreground">{STATES_VI.loading}</p>
          )}
          {auditError && (
            <p className="text-sm text-destructive">{auditError}</p>
          )}
          {!auditPending && !auditError && audit && audit.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {ORDERS_VI.noAuditHistory}
            </p>
          )}
          {!auditPending && !auditError && audit && audit.length > 0 && (
            <ol className="flex flex-col gap-2">
              {audit.map((entry) => (
                <li key={entry.id} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{entry.label}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatVNDateTime(entry.at)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Bởi{" "}
                    <span className="font-medium text-foreground">
                      {entry.by_name}
                    </span>
                  </p>
                  {entry.reason && (
                    <p className="mt-1 text-sm">
                      <span className="text-muted-foreground">Lý do: </span>
                      {entry.reason}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * <xl slide-over host for `OrderDetailContent` (mobile/tablet/narrow-desktop
 * master-detail mode). At `xl:`+, `OrdersClient` renders `OrderDetailContent`
 * inline instead of mounting this Sheet.
 */
export function OrderDetailSheet({
  order,
  open,
  onOpenChange,
}: OrderDetailSheetProps) {
  if (!order) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="font-mono text-base">
            #{order.order_number}
          </SheetTitle>
        </SheetHeader>
        <OrderDetailContent order={order} />
      </SheetContent>
    </Sheet>
  );
}
