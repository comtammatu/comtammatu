"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: baseline inline Vietnamese copy in order detail sheet */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";
import { cn } from "@comtammatu/ui";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Item } from "@comtammatu/ui/components/item";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import {
  fetchOrderAuditLog,
  fetchOrderItems,
  fetchOrderOperationalTrace,
  type OrderAuditEntry,
  type OrderItem,
  type OrderItemModifier,
  type OrderItemSide,
  type OrderOperationalTrace,
  type OrderRow,
} from "./actions";
import { summarizeOrderKdsEvidence } from "./_lib/order-kds-evidence";

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
import { AppEmptyState, DescriptionList } from "@/components/surface";
import { Frame } from "@comtammatu/ui/components/frame";

function itemStatusToneClass(status: string): string {
  switch (status) {
    case "pending":
    case "preparing":
      return "border-warning/20 bg-warning/10";
    case "ready":
    case "served":
      return "border-success/20 bg-success/10";
    case "cancelled":
      return "border-destructive/20 bg-destructive/10 border-dashed";
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

const KDS_EVENT_LABELS: Record<string, string> = {
  sent: "Đã gửi bếp",
  preparing: "Đang làm",
  completed: "Hoàn thành",
  recalled: "Gọi làm lại",
  served: "Đã phục vụ",
  cancelled: "Đã huỷ",
  out_of_stock: "Hết món",
};

const PRINT_JOB_LABELS: Record<string, string> = {
  kitchen_ticket: "Phiếu bếp",
  receipt: "Hoá đơn thanh toán",
  provisional_bill: "Phiếu tạm tính",
  shift_close_report: "Báo cáo chốt ca",
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  create: "Tạo",
  update: "Cập nhật",
  delete: "Xoá",
  sepay_canonical_reconciliation_match: "Khớp SePay canonical",
  sepay_canonical_reconciliation_backfill: "Bổ sung đối soát SePay",
  sepay_canonical_reconciliation_needs_review: "SePay cần đối soát",
};

function formatSnapshotOptions(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const labels = value.flatMap((option) => {
    if (!option || typeof option !== "object" || Array.isArray(option)) {
      return [];
    }
    const record = option as Record<string, unknown>;
    if (typeof record.name !== "string") return [];
    const quantity =
      typeof record.quantity === "number" && record.quantity > 1
        ? `${String(record.quantity)}× `
        : "";
    return [`${quantity}${record.name}`];
  });
  return labels.length > 0 ? labels.join(", ") : null;
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
  const [operationalTrace, setOperationalTrace] =
    useState<OrderOperationalTrace | null>(null);
  const [operationalError, setOperationalError] = useState<string | null>(null);
  const [operationalPending, startOperationalTransition] = useTransition();

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

  const loadOperationalTrace = useCallback((id: number) => {
    startOperationalTransition(async () => {
      const result = await fetchOrderOperationalTrace(id);
      if (result.success && result.data) {
        setOperationalTrace(result.data);
        setOperationalError(null);
      } else {
        setOperationalError(
          result.error ?? ORDERS_VI.loadOperationalEvidenceFailed,
        );
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
    setOperationalTrace(null);
    setOperationalError(null);
    loadAudit(orderId);
    loadItems(orderId);
    loadOperationalTrace(orderId);
  }, [orderId, loadAudit, loadItems, loadOperationalTrace]);

  // Realtime: a cashier on another terminal cancels/edits/serves → INSERT
  // into order_status_history. Subscribing with filter `order_id=eq.X` keeps
  // the timeline fresh without closing/reopening the host. Migration
  // 20260520010000_audit_log_completeness.sql added the table to the
  // supabase_realtime publication; order_items is not in the publication
  // (see 20260428000000_pos_realtime_publication.sql) so we refetch it too.
  const initialSubscribeSeenRef = useRef(false);

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
            loadOperationalTrace(orderId);
          },
        )
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          if (!initialSubscribeSeenRef.current) {
            initialSubscribeSeenRef.current = true;
            return;
          }
          loadAudit(orderId);
          loadItems(orderId);
          loadOperationalTrace(orderId);
        }),
    [orderId, loadAudit, loadItems, loadOperationalTrace],
  );

  // Tab visibility reconnect backstop
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        loadAudit(orderId);
        loadItems(orderId);
        loadOperationalTrace(orderId);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [orderId, loadAudit, loadItems, loadOperationalTrace]);

  const hasDiscount = order.discount_amount > 0;
  const hasTax = order.tax_amount > 0;
  const hasServiceCharge = order.service_charge > 0;
  const printedJobCount =
    operationalTrace?.print_jobs.filter((job) => job.status === "printed")
      .length ?? 0;
  const kdsSummary = operationalTrace
    ? summarizeOrderKdsEvidence(operationalTrace.kds_events)
    : null;
  const missingReconciliationCount =
    operationalTrace?.payments.filter(
      (payment) => payment.reconciliation_status === "missing",
    ).length ?? 0;

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
          <Frame className="p-3 flex flex-col gap-2">
            <SectionLabel>
              {ORDERS_VI.payment}
              {order.payment_attempts.length > 1
                ? ` (${String(order.payment_attempts.length)} lần thử)`
                : ""}
            </SectionLabel>
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
            {order.payment_attempts.length > 1 && (
              <ul className="border-t pt-2 flex flex-col gap-1.5">
                {order.payment_attempts.map((attempt) => (
                  <li
                    key={attempt.id}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant="outline" className="shrink-0">
                        {getPaymentMethodLabelVi(attempt.method)}
                      </Badge>
                      <StatusBadge domain="payment" value={attempt.status} />
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono tabular-nums">
                        {formatVND(attempt.amount)}
                      </p>
                      <p className="text-muted-foreground">
                        {formatVNDateTime(
                          attempt.paid_at ?? attempt.created_at,
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Frame>
        )}

        {!order.payment && order.payment_method && (
          <Frame className="p-3 flex flex-col gap-2">
            <SectionLabel>{ORDERS_VI.payment}</SectionLabel>
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
          </Frame>
        )}

        {/* ─── Items ─── */}
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <SectionLabel>
              Món gọi{items ? ` (${items.length})` : ""}
            </SectionLabel>
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
            <AppEmptyState compact title={ORDERS_VI.loadingItems} />
          )}
          {!itemsError && items !== null && items.length === 0 && (
            <AppEmptyState compact title={ORDERS_VI.noItems} />
          )}
          {operationalTrace && (
            <Frame className="mb-2 grid grid-cols-2 gap-2 p-3 text-xs lg:grid-cols-4">
              <div>
                <span className="text-muted-foreground">Dòng món</span>
                <p className="font-mono font-semibold">
                  {operationalTrace.item_summary.item_row_count}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Số lượng gọi</span>
                <p className="font-mono font-semibold">
                  {operationalTrace.item_summary.item_quantity}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Cơm có snapshot</span>
                <p className="font-mono font-semibold">
                  {operationalTrace.item_summary.main_dish_quantity}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Ăn kèm</span>
                <p className="font-mono font-semibold">
                  {operationalTrace.item_summary.side_dish_quantity +
                    operationalTrace.item_summary.included_side_quantity}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Đã phục vụ</span>
                <p className="font-mono font-semibold">
                  {operationalTrace.item_summary.served_item_quantity}
                </p>
              </div>
              {operationalTrace.item_summary.legacy_unclassified_quantity >
                0 && (
                <div className="col-span-2 lg:col-span-3">
                  <span className="text-muted-foreground">Dữ liệu món cũ</span>
                  <p className="text-warning">
                    {
                      operationalTrace.item_summary
                        .legacy_unclassified_quantity
                    }{" "}
                    món chưa có snapshot; danh mục hiện tại ước tính{" "}
                    {
                      operationalTrace.item_summary
                        .legacy_current_main_dish_quantity
                    }{" "}
                    phần cơm, không cộng vào số canonical.
                  </p>
                </div>
              )}
            </Frame>
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
                  <li key={item.id}>
                    <Frame
                      className={cn(
                        "p-3 transition-colors",
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
                              isCancelled &&
                                "line-through text-muted-foreground",
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
                    </Frame>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ─── Totals ─── */}
        <Frame className="p-3 flex flex-col gap-2 text-sm">
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
        </Frame>

        {/* ─── Operational evidence ─── */}
        <div>
          <SectionLabel>Bằng chứng vận hành</SectionLabel>
          {operationalPending && operationalTrace === null && (
            <p className="mt-2 text-sm text-muted-foreground">
              {ORDERS_VI.loadingOperationalEvidence}
            </p>
          )}
          {operationalError && (
            <p className="mt-2 text-sm text-destructive">{operationalError}</p>
          )}
          {operationalTrace && (
            <div className="mt-2 flex flex-col gap-2">
              <Frame className="grid grid-cols-2 gap-2 p-3 text-xs">
                <div>
                  <span className="text-muted-foreground">KDS hoàn thành</span>
                  <p className="font-mono font-semibold">
                    {kdsSummary?.completedItemQuantity ?? 0} món ·{" "}
                    {kdsSummary?.completedTicketCount ?? 0} ticket
                  </p>
                  {(kdsSummary?.legacyCompletedItemQuantity ?? 0) > 0 && (
                    <p className="text-warning">
                      {kdsSummary?.legacyCompletedItemQuantity ?? 0} món ·{" "}
                      {kdsSummary?.legacyCompletedTicketCount ?? 0} snapshot cũ
                    </p>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">Phiếu in</span>
                  <p className="font-mono font-semibold">
                    {printedJobCount}/{operationalTrace.print_jobs.length} đã in
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">HĐĐT</span>
                  <p className="font-mono font-semibold">
                    {operationalTrace.tax_invoices.length} bằng chứng
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">POS / audit</span>
                  <p className="font-mono font-semibold">
                    {operationalTrace.pos_session_id ? (
                      <Link
                        href={`/br/${String(operationalTrace.branch_id)}/pos-sessions?session=${String(operationalTrace.pos_session_id)}`}
                        className="underline-offset-4 hover:underline"
                      >
                        Ca #{String(operationalTrace.pos_session_id)}
                      </Link>
                    ) : (
                      "Không có ca"
                    )}
                    {" · "}
                    {operationalTrace.audit_events.length} audit
                  </p>
                </div>
              </Frame>

              {missingReconciliationCount > 0 && (
                <Frame className="border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                  Có {missingReconciliationCount} thanh toán VietQR thiếu liên
                  kết đối soát canonical.
                </Frame>
              )}

              {(kdsSummary?.legacyCompletedItemQuantity ?? 0) > 0 && (
                <Frame className="border-warning/20 bg-warning/10 p-3 text-sm text-warning">
                  KDS chỉ còn snapshot ticket sống lúc chuyển đổi; phiếu in cũ
                  không có ticket ID để nối chính xác. Không thể dùng dữ liệu
                  này để kết luận bếp đã làm hoặc giao đủ.
                </Frame>
              )}

              {operationalTrace.kds_events.length > 0 && (
                <Item
                  variant="outline"
                  className="block p-3"
                  render={<details />}
                >
                  <summary className="cursor-pointer text-sm font-medium">
                    KDS ({operationalTrace.kds_events.length})
                  </summary>
                  <ol className="mt-2 flex flex-col gap-2">
                    {operationalTrace.kds_events.map((event) => {
                      const itemName =
                        typeof event.item_snapshot.item_name === "string"
                          ? event.item_snapshot.item_name
                          : `Món #${String(event.order_item_id)}`;
                      const quantity =
                        typeof event.item_snapshot.quantity === "number"
                          ? event.item_snapshot.quantity
                          : 0;
                      const sides = formatSnapshotOptions(
                        event.item_snapshot.sides,
                      );
                      const modifiers = formatSnapshotOptions(
                        event.item_snapshot.modifiers,
                      );
                      const note =
                        typeof event.item_snapshot.note === "string"
                          ? event.item_snapshot.note
                          : null;
                      const linkedPrintJobs =
                        operationalTrace.print_jobs.filter((job) => {
                          const ticketIds = job.payload_summary.ticket_ids;
                          return (
                            Array.isArray(ticketIds) &&
                            ticketIds.includes(event.ticket_id)
                          );
                        });
                      const isLegacySnapshot =
                        event.context.evidence_source ===
                        "legacy_live_snapshot";
                      return (
                        <li key={event.id} className="text-xs">
                          <p className="font-medium">
                            {KDS_EVENT_LABELS[event.event_type] ??
                              "Sự kiện KDS"}{" "}
                            · {quantity}× {itemName}
                          </p>
                          <p className="text-muted-foreground">
                            {formatVNDateTime(event.occurred_at)} ·{" "}
                            {event.actor_name ?? "Hệ thống"} · ticket #
                            {String(event.ticket_id)} · trạm #
                            {String(event.station_id)}
                          </p>
                          {sides && (
                            <p className="text-muted-foreground">
                              Kèm: {sides}
                            </p>
                          )}
                          {modifiers && (
                            <p className="text-muted-foreground">
                              Tuỳ chọn: {modifiers}
                            </p>
                          )}
                          {note && (
                            <p className="text-muted-foreground">
                              Ghi chú: {note}
                            </p>
                          )}
                          {event.reason && (
                            <p className="text-muted-foreground">
                              Lý do: {event.reason}
                            </p>
                          )}
                          {isLegacySnapshot && (
                            <p className="text-warning">
                              Snapshot lúc chuyển đổi; không phải lịch sử đầy đủ
                              và không có liên kết phiếu in chính xác.
                            </p>
                          )}
                          {linkedPrintJobs.length > 0 && (
                            <p className="text-muted-foreground">
                              Print job:{" "}
                              {linkedPrintJobs
                                .map((job) => `#${String(job.id)}`)
                                .join(", ")}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </Item>
              )}

              {operationalTrace.print_jobs.length > 0 && (
                <Item
                  variant="outline"
                  className="block p-3"
                  render={<details />}
                >
                  <summary className="cursor-pointer text-sm font-medium">
                    Phiếu in ({operationalTrace.print_jobs.length})
                  </summary>
                  <ol className="mt-2 flex flex-col gap-2">
                    {operationalTrace.print_jobs.map((job) => (
                      <li
                        key={job.id}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <p className="font-medium">
                            {PRINT_JOB_LABELS[job.job_type] ?? "Phiếu in"} · #
                            {String(job.id)}
                          </p>
                          <p className="text-muted-foreground">
                            {formatVNDateTime(job.printed_at ?? job.created_at)}
                          </p>
                        </div>
                        <StatusBadge domain="print-job" value={job.status} />
                      </li>
                    ))}
                  </ol>
                </Item>
              )}

              {operationalTrace.tax_invoices.length > 0 && (
                <Item
                  variant="outline"
                  className="block p-3"
                  render={<details />}
                >
                  <summary className="cursor-pointer text-sm font-medium">
                    HĐĐT ({operationalTrace.tax_invoices.length})
                  </summary>
                  <ol className="mt-2 flex flex-col gap-2">
                    {operationalTrace.tax_invoices.map((invoice) => (
                      <li
                        key={invoice.id}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <p className="font-medium">
                            {invoice.invoice_kind === "daily_summary"
                              ? "HĐ tổng hợp ngày"
                              : "HĐ theo đơn"}
                            {invoice.invoice_number
                              ? ` · ${invoice.invoice_number}`
                              : ""}
                          </p>
                          <p className="text-muted-foreground">
                            {invoice.provider_ref ?? `#${String(invoice.id)}`}
                          </p>
                        </div>
                        <StatusBadge
                          domain="tax-invoice"
                          value={invoice.status}
                        />
                      </li>
                    ))}
                  </ol>
                </Item>
              )}

              {operationalTrace.audit_events.length > 0 && (
                <Item
                  variant="outline"
                  className="block p-3"
                  render={<details />}
                >
                  <summary className="cursor-pointer text-sm font-medium">
                    Audit hệ thống ({operationalTrace.audit_events.length})
                  </summary>
                  <ol className="mt-2 flex flex-col gap-2">
                    {operationalTrace.audit_events.map((event) => (
                      <li key={event.id} className="text-xs">
                        <p className="font-medium">
                          {AUDIT_ACTION_LABELS[event.action] ??
                            "Thao tác hệ thống"}
                        </p>
                        <p className="text-muted-foreground">
                          {formatVNDateTime(event.created_at)} ·{" "}
                          {event.actor_name ?? "Hệ thống"} · {event.entity_type}{" "}
                          #
                          {event.entity_id === null
                            ? "—"
                            : String(event.entity_id)}
                        </p>
                      </li>
                    ))}
                  </ol>
                </Item>
              )}
            </div>
          )}
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
                <li key={entry.id}>
                  <Frame className="p-3 text-sm">
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
                  </Frame>
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
          <SheetDescription className="sr-only">
            Chi tiết đơn hàng và lịch sử thao tác.
          </SheetDescription>
        </SheetHeader>
        <OrderDetailContent order={order} />
      </SheetContent>
    </Sheet>
  );
}
