"use client";

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

import { BRANCH_VI, FORM_VI } from "@comtammatu/shared/messages";

type ItemStatusBadge =
  | "warning"
  | "info"
  | "success"
  | "destructive"
  | "outline";

const ITEM_STATUS_META: Record<
  string,
  { label: string; variant: ItemStatusBadge }
> = {
  pending: { label: "Chờ", variant: "warning" },
  preparing: { label: "Đang làm", variant: "warning" },
  ready: { label: "Sẵn sàng", variant: "info" },
  served: { label: "Đã phục vụ", variant: "success" },
  cancelled: { label: "Đã hủy", variant: "destructive" },
};

function itemStatusToneClass(status: string): string {
  switch (status) {
    case "pending":
    case "preparing":
      return "border-warning/30 bg-warning/5";
    case "ready":
      return "border-info/30 bg-info/5";
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
const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Chờ xử lý",
  in_progress: "Đang làm",
  ready: "Sẵn sàng",
  completed: "Hòan thành",
  cancelled: "Đã hủy",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Tiền mặt",
  vietqr: "VietQR",
  momo: "MoMo",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Chờ thanh toán",
  paid: "Đã thanh toán",
  failed: "Thất bại",
  refunded: "Hòan tiền",
};

function orderStatusTone(
  status: string,
): "neutral" | "success" | "warning" | "danger" | "info" {
  switch (status) {
    case "completed":
      return "success";
    case "in_progress":
      return "warning";
    case "ready":
      return "info";
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}

function paymentStatusBadgeVariant(
  status: string,
): "default" | "outline" | "secondary" | "destructive" {
  switch (status) {
    case "paid":
      return "default";
    case "pending":
      return "secondary";
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}

/* ─── Props ─── */

interface OrderDetailSheetProps {
  order: OrderRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/* ─── Component ─── */

export function OrderDetailSheet({
  order,
  open,
  onOpenChange,
}: OrderDetailSheetProps) {
  const [audit, setAudit] = useState<OrderAuditEntry[] | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditPending, startAuditTransition] = useTransition();
  const [items, setItems] = useState<OrderItem[] | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [itemsPending, startItemsTransition] = useTransition();

  const orderId = order?.id ?? null;

  // Fetch lịch sử thao tác. Tách thành callback để vừa dùng cho mount-effect
  // vừa dùng cho realtime callback (chia sẻ logic, không bị stale closure).
  const loadAudit = useCallback((id: number) => {
    startAuditTransition(async () => {
      const result = await fetchOrderAuditLog(id);
      if (result.success && result.data) {
        setAudit(result.data);
        setAuditError(null);
      } else {
        setAuditError(result.error ?? "Không thể tải lịch sử");
      }
    });
  }, []);

  // List view bỏ items để giữ payload nhỏ — load on-demand. order_items
  // intentionally KHÔNG có trong realtime publication; ta piggyback signal
  // từ order_status_history (cùng RPC ghi cả 2) để refresh items.
  const loadItems = useCallback((id: number) => {
    startItemsTransition(async () => {
      const result = await fetchOrderItems(id);
      if (result.success && result.data) {
        setItems(result.data);
        setItemsError(null);
      } else {
        setItemsError(result.error ?? "Không thể tải món");
      }
    });
  }, []);

  // Lazy fetch khi sheet mở cho 1 đơn cụ thể. Reset khi đổi đơn / đóng sheet
  // để tránh hiển thị stale của đơn trước.
  useEffect(() => {
    if (!open || orderId == null) {
      setAudit(null);
      setAuditError(null);
      setItems(null);
      setItemsError(null);
      return;
    }
    setAudit(null);
    setAuditError(null);
    setItems(null);
    setItemsError(null);
    loadAudit(orderId);
    loadItems(orderId);
  }, [open, orderId, loadAudit, loadItems]);

  // Realtime: cashier ở terminal khác hủy/sửa/phục vụ → INSERT vào
  // order_status_history. Subscribe filter `order_id=eq.X` để timeline tự
  // refresh mà quản lý không phải đóng/mở lại sheet. Migration
  // 20260520010000_audit_log_completeness.sql đã add table vào
  // supabase_realtime publication. order_items không có trong publication
  // (xem 20260428000000_pos_realtime_publication.sql) nên ta refetch cùng.
  useRealtimeChannel(
    (supabase) => {
      if (!open || orderId == null) return null;
      return supabase
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
        .subscribe();
    },
    [open, orderId, loadAudit, loadItems],
  );

  if (!order) return null;

  const hasDiscount = order.discount_amount > 0;
  const hasTax = order.tax_amount > 0;
  const hasServiceCharge = order.service_charge > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="font-mono text-base">
            #{order.order_number}
          </SheetTitle>
        </SheetHeader>

        {/* ─── Order info ─── */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <span className="text-muted-foreground">{FORM_VI.status}</span>
            <div>
              <Badge
                variant={
                  orderStatusTone(order.status) === "success"
                    ? "success"
                    : orderStatusTone(order.status) === "warning"
                      ? "warning"
                      : orderStatusTone(order.status) === "info"
                        ? "info"
                        : orderStatusTone(order.status) === "danger"
                          ? "destructive"
                          : "secondary"
                }
              >
                {ORDER_STATUS_LABELS[order.status] ?? order.status}
              </Badge>
            </div>

            <span className="text-muted-foreground">{BRANCH_VI.long}</span>
            <span>{order.branch_name}</span>

            <span className="text-muted-foreground">Người order</span>
            <span>{order.created_by_name}</span>

            <span className="text-muted-foreground">Thời gian</span>
            <span>{formatVNDateTime(order.created_at)}</span>

            <span className="text-muted-foreground">Loại đơn</span>
            <span className="capitalize">{order.order_type}</span>
          </div>

          {/* ─── Payment info ─── */}
          {order.payment && (
            <div className="rounded-md border p-3 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Thanh toán
              </p>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {PAYMENT_METHOD_LABELS[order.payment.method] ??
                      order.payment.method}
                  </Badge>
                  <Badge
                    variant={paymentStatusBadgeVariant(order.payment.status)}
                  >
                    {PAYMENT_STATUS_LABELS[order.payment.status] ??
                      order.payment.status}
                  </Badge>
                </div>
                <span className="font-mono font-medium">
                  {formatVND(order.payment.amount)}
                </span>
              </div>
            </div>
          )}

          {!order.payment && order.payment_method && (
            <div className="rounded-md border p-3 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Thanh toán
              </p>
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline">
                  {PAYMENT_METHOD_LABELS[order.payment_method] ??
                    order.payment_method}
                </Badge>
                {order.payment_status && (
                  <Badge
                    variant={paymentStatusBadgeVariant(order.payment_status)}
                  >
                    {PAYMENT_STATUS_LABELS[order.payment_status] ??
                      order.payment_status}
                  </Badge>
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
                  Có {items.filter((i) => i.status === "cancelled").length} món
                  đã hủy
                </p>
              )}
            </div>
            {itemsError && (
              <p className="mb-2 text-sm text-destructive">{itemsError}</p>
            )}
            {!itemsError && items === null && itemsPending && (
              <div className="rounded-md border px-4 py-6 text-center text-sm text-muted-foreground">
                Đang tải món…
              </div>
            )}
            {!itemsError && items !== null && items.length === 0 && (
              <div className="rounded-md border px-4 py-6 text-center text-sm text-muted-foreground">
                Không có món nào
              </div>
            )}
            {!itemsError && items !== null && items.length > 0 && (
              <ul className="space-y-2">
                {items.map((item) => {
                  const isCancelled = item.status === "cancelled";
                  const statusInfo = ITEM_STATUS_META[item.status] ?? {
                    label: item.status,
                    variant: "outline" as ItemStatusBadge,
                  };
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
                            <Badge
                              variant={statusInfo.variant}
                              className="h-5 px-1.5 text-xs font-semibold uppercase tracking-wide"
                            >
                              {statusInfo.label}
                            </Badge>
                          </div>
                          {item.variant_name && (
                            <p
                              className={cn(
                                "mt-0.5 text-xs text-muted-foreground",
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
                        <dl className="mt-2 space-y-1 border-t pt-2 text-xs">
                          {modifierLine && (
                            <div
                              className={cn(
                                "flex gap-2",
                                isCancelled && "line-through opacity-70",
                              )}
                            >
                              <dt className="shrink-0 text-muted-foreground">
                                Tuỳ chọn
                              </dt>
                              <dd className="text-foreground">
                                {item.modifiers.map(formatModifier).join(", ")}
                              </dd>
                            </div>
                          )}
                          {sideLine && (
                            <div
                              className={cn(
                                "flex gap-2",
                                isCancelled && "line-through opacity-70",
                              )}
                            >
                              <dt className="shrink-0 text-muted-foreground">
                                Kèm
                              </dt>
                              <dd className="text-foreground">
                                {item.sides.map(formatSide).join(", ")}
                              </dd>
                            </div>
                          )}
                          {item.note && (
                            <div
                              className={cn(
                                "flex gap-2",
                                isCancelled && "line-through opacity-70",
                              )}
                            >
                              <dt className="shrink-0 text-muted-foreground">
                                Ghi chú
                              </dt>
                              <dd className="text-foreground">{item.note}</dd>
                            </div>
                          )}
                          {isCancelled && item.cancel_reason && (
                            <div className="flex gap-2">
                              <dt className="shrink-0 text-destructive">
                                Lý do hủy
                              </dt>
                              <dd className="text-foreground">
                                {item.cancel_reason}
                              </dd>
                            </div>
                          )}
                        </dl>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* ─── Totals ─── */}
          <div className="rounded-md border p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{FORM_VI.subtotal}</span>
              <span className="font-mono">{formatVND(order.subtotal)}</span>
            </div>
            {hasDiscount && (
              <div className="text-success flex justify-between">
                <span>Giảm giá</span>
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
                <span className="text-muted-foreground">Phụ phí</span>
                <span className="font-mono">
                  {formatVND(order.service_charge)}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t pt-1.5 font-semibold">
              <span>{FORM_VI.totalAmount}</span>
              <span className="font-mono">{formatVND(order.total_amount)}</span>
            </div>
          </div>

          {/* ─── Audit timeline ─── */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Lịch sử thao tác
            </p>
            {auditPending && (
              <p className="text-sm text-muted-foreground">Đang tải…</p>
            )}
            {auditError && (
              <p className="text-sm text-destructive">{auditError}</p>
            )}
            {!auditPending && !auditError && audit && audit.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Chưa có thao tác nào được ghi nhận.
              </p>
            )}
            {!auditPending && !auditError && audit && audit.length > 0 && (
              <ol className="space-y-2">
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
      </SheetContent>
    </Sheet>
  );
}
