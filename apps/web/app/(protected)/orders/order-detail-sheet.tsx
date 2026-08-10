"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: baseline inline Vietnamese copy in order detail sheet */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";
import { cn } from "@comtammatu/ui";
import {
  formatSidePortionLabel,
  formatVND,
  sidePortionQuantity,
} from "@comtammatu/shared/format";
import { formatAuditActionLabel } from "@comtammatu/shared/messages";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Item } from "@comtammatu/ui/components/item";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
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
import {
  resolveOrderOperationalVerdict,
  summarizeOrderKdsEvidence,
  summarizeOrderItemKdsEvidence,
  type OrderItemKitchenEvidence,
  type OrderOperationalVerdict,
} from "./_lib/order-kds-evidence";

import {
  computeOrderWaitInfo,
  getOrderAlertBadgeProps,
} from "./_lib/order-wait-time";
import { ORDERS_COPY } from "./orders-copy";

/* ─── Helpers ─── */

import {
  BRANCH_VI,
  FORM_VI,
  ORDERS_VI,
  POS_VI,
  STATES_VI,
} from "@comtammatu/shared/messages";
import {
  getOrderTypeLabelVi,
  getPaymentMethodLabelVi,
} from "@comtammatu/shared/labels";
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
  const qty = sidePortionQuantity(s.quantity);
  const label = formatSidePortionLabel(s.name, qty);
  const totalPrice = s.price * qty;
  return totalPrice > 0 ? `${label} (+${formatVND(totalPrice)})` : label;
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

const VERDICT_COPY: Record<
  OrderOperationalVerdict,
  { title: string; description: string }
> = {
  cancelled: {
    title: "Đơn đã hủy",
    description:
      "Xem danh sách món và lịch sử thao tác bên dưới để biết phần nào đã được hủy.",
  },
  in_progress: {
    title: "Đơn đang được xử lý",
    description:
      "Các con số bên dưới là trạng thái hệ thống ghi nhận tại thời điểm hiện tại.",
  },
  payment_needs_review: {
    title: "Thanh toán cần kiểm tra",
    description:
      "Có khoản VietQR chưa khớp với giao dịch ngân hàng. Xem phần thanh toán và các thay đổi trên đơn.",
  },
  print_needs_review: {
    title: "Có phiếu chưa in thành công",
    description:
      "Kiểm tra máy in hoặc lịch sử phiếu. Lượt in không xác nhận món đã được làm hay phục vụ.",
  },
  kitchen_needs_review: {
    title: "Món và bếp chưa khớp",
    description:
      "Có món trong đơn chưa có đủ ghi nhận bếp làm xong. Xem các dòng có nhãn Chưa khớp.",
  },
  history_incomplete: {
    title: "Chưa đủ dữ liệu để kết luận",
    description:
      "Đơn này thuộc giai đoạn hệ thống chưa lưu đầy đủ phân loại món hoặc lịch sử bếp. Cần đối chiếu phiếu giấy hoặc xác nhận ca; không dùng số ước tính để khẳng định bếp đã làm hay giao đủ.",
  },
  recorded: {
    title: "Chưa thấy lỗi rõ ràng",
    description:
      "Các kiểm tra tự động chưa phát hiện chặng bị thiếu. Vẫn cần đối chiếu thực tế nếu có phản ánh từ ca vận hành.",
  },
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

function formatKitchenStage(
  evidence: OrderItemKitchenEvidence | undefined,
  orderedQuantity: number,
): string {
  if (!evidence) return "Chưa có ghi nhận";
  if (evidence.state === "history_incomplete") return "Dữ liệu cũ";
  if (evidence.state === "cancelled") return "Đã huỷ";
  if (evidence.state === "needs_review") return "Cần kiểm tra";
  if (evidence.state === "in_progress") {
    return (
      KDS_EVENT_LABELS[evidence.latestEventType ?? ""] ?? "Đang xử lý tại bếp"
    );
  }

  return `${String(evidence.completedQuantity ?? 0)}/${String(orderedQuantity)}`;
}

function formatServedStage(item: OrderItem): string {
  if (item.status === "cancelled") return "Đã huỷ";
  if (item.status === "served") {
    return `${String(item.quantity)}/${String(item.quantity)}`;
  }
  return "Chưa ghi nhận";
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
  const itemKdsEvidence = operationalTrace
    ? summarizeOrderItemKdsEvidence(operationalTrace.kds_events)
    : new Map<number, OrderItemKitchenEvidence>();
  const missingReconciliationCount =
    operationalTrace?.payments.filter(
      (payment) => payment.reconciliation_status === "missing",
    ).length ?? 0;
  const operationalVerdict =
    operationalTrace && kdsSummary
      ? resolveOrderOperationalVerdict({
          orderStatus: order.status,
          itemQuantity: operationalTrace.item_summary.item_quantity,
          legacyUnclassifiedQuantity:
            operationalTrace.item_summary.legacy_unclassified_quantity,
          kds: kdsSummary,
          printJobCount: operationalTrace.print_jobs.length,
          printedJobCount,
          missingReconciliationCount,
        })
      : null;
  const hasIncompleteHistory =
    operationalTrace !== null &&
    kdsSummary !== null &&
    (operationalTrace.item_summary.legacy_unclassified_quantity > 0 ||
      kdsSummary.legacyCompletedItemQuantity > 0);
  const orderTypeLabel = getOrderTypeLabelVi(order.order_type);
  const orderChangeEntries = [
    ...(audit ?? []).map((entry) => ({
      key: `history-${String(entry.id)}`,
      label: entry.label,
      at: entry.at,
      actorName: entry.by_name,
      reason: entry.reason,
    })),
    ...(operationalTrace?.audit_events ?? []).map((event) => ({
      key: `audit-${String(event.id)}`,
      label: formatAuditActionLabel(event.action),
      at: event.created_at,
      actorName: event.actor_name ?? "Hệ thống",
      reason: null,
    })),
  ].sort((left, right) => Date.parse(right.at) - Date.parse(left.at));

  const waitInfo = computeOrderWaitInfo(
    order.created_at,
    order.kds_completed_at,
  );
  const alertBadgeProps = getOrderAlertBadgeProps(waitInfo);

  return (
    <>
      {/* ─── Order info ─── */}
      <div className="flex flex-col gap-4">
        {waitInfo.alertLevel === "critical" && (
          <NoteCallout
            tone="warning"
            className="border border-destructive/20 bg-destructive/10 text-destructive"
            label={ORDERS_COPY.kdsAlertCalloutCriticalLabel}
          >
            {ORDERS_COPY.kdsAlertCalloutCritical}
            {ORDERS_COPY.kdsAlertWaitMinutes(waitInfo.waitMinutes)}
          </NoteCallout>
        )}
        {waitInfo.alertLevel === "warning" && (
          <NoteCallout
            tone="warning"
            label={ORDERS_COPY.kdsAlertCalloutWarningLabel}
          >
            {ORDERS_COPY.kdsAlertCalloutWarning}
            {ORDERS_COPY.kdsAlertWaitMinutes(waitInfo.waitMinutes)}
          </NoteCallout>
        )}
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
              term: ORDERS_COPY.waitTimeHeader,
              description: (
                <Badge
                  variant={alertBadgeProps.badgeVariant}
                  className={alertBadgeProps.badgeClassName}
                >
                  {alertBadgeProps.label}
                </Badge>
              ),
            },
            {
              term: ORDERS_VI.orderType,
              description: orderTypeLabel,
            },
          ]}
        />

        <div>
          <SectionLabel>Kết luận đối chiếu</SectionLabel>
          {operationalPending && operationalTrace === null && (
            <p className="mt-2 text-sm text-muted-foreground">
              {ORDERS_VI.loadingOperationalEvidence}
            </p>
          )}
          {operationalError && (
            <p className="mt-2 text-sm text-destructive">{operationalError}</p>
          )}
          {operationalTrace && operationalVerdict && kdsSummary && (
            <div className="mt-2 flex flex-col gap-2">
              <NoteCallout
                tone={
                  operationalVerdict === "recorded" ||
                  operationalVerdict === "cancelled"
                    ? "muted"
                    : "warning"
                }
                label={VERDICT_COPY[operationalVerdict].title}
              >
                {VERDICT_COPY[operationalVerdict].description}
              </NoteCallout>
              <Frame className="p-3">
                <DescriptionList
                  className="grid grid-cols-3 gap-3"
                  descriptionClassName="font-mono tabular-nums"
                  items={[
                    {
                      term: "Đơn gọi",
                      description: (
                        <>
                          <span className="block text-base">
                            {operationalTrace.item_summary.item_quantity}
                          </span>
                          <span className="block font-sans text-xs font-normal text-muted-foreground">
                            {hasIncompleteHistory
                              ? "Dữ liệu cũ"
                              : `${String(operationalTrace.item_summary.main_dish_quantity)} món chính`}
                          </span>
                        </>
                      ),
                    },
                    {
                      term: "Bếp làm xong",
                      description: (
                        <>
                          <span className="block text-base">
                            {hasIncompleteHistory
                              ? String(
                                  kdsSummary.completedItemQuantity +
                                    kdsSummary.legacyCompletedItemQuantity,
                                )
                              : `${String(kdsSummary.completedItemQuantity)}/${String(operationalTrace.item_summary.item_quantity)}`}
                          </span>
                          <span className="block font-sans text-xs font-normal text-muted-foreground">
                            {hasIncompleteHistory
                              ? "Chưa đủ lịch sử"
                              : "Bếp đánh dấu xong"}
                          </span>
                        </>
                      ),
                    },
                    {
                      term: "Đã phục vụ",
                      description: (
                        <>
                          <span className="block text-base">
                            {String(
                              operationalTrace.item_summary
                                .served_item_quantity,
                            )}
                            /
                            {String(
                              operationalTrace.item_summary.item_quantity,
                            )}
                          </span>
                          <span className="block font-sans text-xs font-normal text-muted-foreground">
                            Theo hệ thống
                          </span>
                        </>
                      ),
                    },
                  ]}
                />
              </Frame>
            </div>
          )}
        </div>

        {/* ─── Items ─── */}
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <SectionLabel>
              Món trong đơn{items ? ` (${items.length})` : ""}
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
          {!itemsError && items !== null && items.length > 0 && (
            <ul className="flex flex-col gap-2">
              {items.map((item) => {
                const isCancelled = item.status === "cancelled";
                const kitchenEvidence = itemKdsEvidence.get(item.id);
                const kitchenQuantity =
                  kitchenEvidence?.completedQuantity ?? null;
                const hasKitchenMismatch =
                  !isCancelled &&
                  kitchenEvidence?.state === "completed" &&
                  kitchenQuantity !== item.quantity;
                const missingKitchenRecord =
                  !isCancelled &&
                  (order.status === "served" ||
                    order.status === "completed") &&
                  kitchenEvidence?.state !== "history_incomplete" &&
                  kitchenEvidence?.state !== "completed";
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

                      <DescriptionList
                        className="mt-3 grid grid-cols-3 gap-2 border-t pt-2"
                        descriptionClassName="font-mono text-xs tabular-nums"
                        items={[
                          {
                            term: "Đơn gọi",
                            description: String(item.quantity),
                          },
                          {
                            term: "Bếp xong",
                            description: (
                              <span
                                className={cn(
                                  (hasKitchenMismatch ||
                                    missingKitchenRecord) &&
                                    "text-warning",
                                )}
                              >
                                {formatKitchenStage(
                                  kitchenEvidence,
                                  item.quantity,
                                )}
                                {(hasKitchenMismatch ||
                                  missingKitchenRecord) && (
                                  <span className="block font-sans font-medium">
                                    Chưa khớp
                                  </span>
                                )}
                              </span>
                            ),
                          },
                          {
                            term: "Phục vụ",
                            description: formatServedStage(item),
                          },
                        ]}
                      />

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

        {/* ─── Payment and totals ─── */}
        <div>
          <SectionLabel>{ORDERS_VI.payment}</SectionLabel>
          <Frame className="mt-2 flex flex-col gap-2 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
              <span className="text-muted-foreground">Trạng thái</span>
              {order.payment ? (
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {getPaymentMethodLabelVi(order.payment.method)}
                  </Badge>
                  <StatusBadge domain="payment" value={order.payment.status} />
                </span>
              ) : order.payment_method ? (
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {getPaymentMethodLabelVi(order.payment_method)}
                  </Badge>
                  {order.payment_status && (
                    <StatusBadge
                      domain="order-payment"
                      value={order.payment_status}
                    />
                  )}
                </span>
              ) : (
                "Chưa ghi nhận"
              )}
            </div>
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

          {order.payment_attempts.length > 1 && (
            <Item
              variant="outline"
              className="mt-2 block p-3"
              render={<details />}
            >
              <summary className="cursor-pointer text-sm font-medium">
                Lịch sử thanh toán ({order.payment_attempts.length})
              </summary>
              <ul className="mt-2 flex flex-col gap-1.5 border-t pt-2">
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
            </Item>
          )}
        </div>

        {/* ─── Supporting reconciliation detail ─── */}
        <div>
          <SectionLabel>Thông tin bổ sung</SectionLabel>
          <div className="mt-2 flex flex-col gap-2">
            {operationalTrace && (
              <>
                {missingReconciliationCount > 0 && (
                  <NoteCallout tone="warning" label="Thanh toán cần kiểm tra">
                    Có {missingReconciliationCount} khoản VietQR chưa khớp với
                    giao dịch ngân hàng.
                  </NoteCallout>
                )}

                {(kdsSummary?.legacyCompletedItemQuantity ?? 0) > 0 && (
                  <NoteCallout tone="warning" label="Lịch sử bếp chưa đầy đủ">
                    Dữ liệu của đơn này được tạo trước thời điểm hệ thống lưu
                    đầy đủ diễn biến tại bếp. Không thể dùng phần này để xác
                    nhận bếp đã làm hoặc giao đủ.
                  </NoteCallout>
                )}

                {operationalTrace.pos_session_id && (
                  <Item variant="outline" className="block p-3">
                    <p className="text-sm">
                      Đơn thuộc{" "}
                      <Link
                        href={`/br/${String(operationalTrace.branch_id)}/pos-sessions?session=${String(operationalTrace.pos_session_id)}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        ca POS #{String(operationalTrace.pos_session_id)}
                      </Link>
                      .
                    </p>
                  </Item>
                )}

                {operationalTrace.kds_events.length > 0 && (
                  <Item
                    variant="outline"
                    className="block p-3"
                    render={<details />}
                  >
                    <summary className="cursor-pointer text-sm font-medium">
                      Diễn biến tại bếp ({operationalTrace.kds_events.length})
                    </summary>
                    <ol className="mt-2 flex flex-col gap-2">
                      {operationalTrace.kds_events.map((event) => {
                        const itemName =
                          typeof event.item_snapshot.item_name === "string"
                            ? event.item_snapshot.item_name
                            : "Món chưa xác định";
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
                                "Cập nhật tại bếp"}{" "}
                              · {quantity}× {itemName}
                            </p>
                            <p className="text-muted-foreground">
                              {formatVNDateTime(event.occurred_at)} ·{" "}
                              {event.actor_name ?? "Hệ thống"}
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
                                Bản ghi cũ; diễn biến trước đó có thể chưa được
                                lưu đầy đủ.
                              </p>
                            )}
                            {linkedPrintJobs.length > 0 && (
                              <p className="text-muted-foreground">
                                Đã nối với {linkedPrintJobs.length} lượt in.
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
                      Phiếu đã in ({operationalTrace.print_jobs.length})
                    </summary>
                    <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                      Lượt in chỉ xác nhận hệ thống đã gửi phiếu; không dùng số
                      này để kết luận món đã ra đủ.
                    </p>
                    <ol className="mt-2 flex flex-col gap-2">
                      {operationalTrace.print_jobs.map((job) => (
                        <li
                          key={job.id}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <p className="font-medium">
                              {PRINT_JOB_LABELS[job.job_type] ?? "Lượt in"}
                            </p>
                            <p className="text-muted-foreground">
                              {formatVNDateTime(
                                job.printed_at ?? job.created_at,
                              )}
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
                      Hóa đơn điện tử ({operationalTrace.tax_invoices.length})
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
                              {invoice.issued_at
                                ? `Phát hành ${formatVNDateTime(invoice.issued_at)}`
                                : "Chưa phát hành"}
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
              </>
            )}

            {(auditPending || auditError || orderChangeEntries.length > 0) && (
              <Item
                variant="outline"
                className="block p-3"
                render={<details />}
              >
                <summary className="cursor-pointer text-sm font-medium">
                  Các thay đổi trên đơn
                  {orderChangeEntries.length > 0
                    ? ` (${String(orderChangeEntries.length)})`
                    : ""}
                </summary>
                <div className="mt-2 border-t pt-2">
                  {auditPending && (
                    <p className="text-sm text-muted-foreground">
                      {STATES_VI.loading}
                    </p>
                  )}
                  {auditError && (
                    <p className="text-sm text-destructive">{auditError}</p>
                  )}
                  {!auditPending &&
                    !auditError &&
                    orderChangeEntries.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        {ORDERS_VI.noAuditHistory}
                      </p>
                    )}
                  {orderChangeEntries.length > 0 && (
                    <ol className="flex flex-col gap-2">
                      {orderChangeEntries.map((entry) => (
                        <li key={entry.key} className="text-xs">
                          <p className="font-medium">{entry.label}</p>
                          <p className="text-muted-foreground">
                            {formatVNDateTime(entry.at)} · {entry.actorName}
                          </p>
                          {entry.reason && (
                            <p className="text-muted-foreground">
                              Lý do: {entry.reason}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </Item>
            )}
          </div>
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
