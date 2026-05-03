"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { fetchOrderAuditLog, type OrderAuditEntry, type OrderRow } from "./actions";

/* ─── Helpers ─── */

import { BRANCH_VI, FORM_VI, PRODUCT_VI } from "@comtammatu/shared/messages";
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

  // Lazy fetch khi sheet mở cho 1 đơn cụ thể. Reset khi đổi đơn / đóng sheet
  // để tránh hiển thị stale của đơn trước.
  useEffect(() => {
    if (!open || orderId == null) {
      setAudit(null);
      setAuditError(null);
      return;
    }
    setAudit(null);
    setAuditError(null);
    loadAudit(orderId);
  }, [open, orderId, loadAudit]);

  // Realtime: cashier ở terminal khác hủy/sửa/phục vụ → INSERT vào
  // order_status_history. Subscribe filter `order_id=eq.X` để timeline tự
  // refresh mà quản lý không phải đóng/mở lại sheet. Migration
  // 20260520010000_audit_log_completeness.sql đã add table vào
  // supabase_realtime publication.
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
          },
        )
        .subscribe();
    },
    [open, orderId, loadAudit],
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
            <span>
              {new Date(order.created_at).toLocaleString("vi-VN", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>

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
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Món gọi ({order.items.length})
            </p>
            <div className="space-y-3 md:hidden">
              {order.items.length === 0 ? (
                <div className="rounded-md border px-4 py-6 text-center text-sm text-muted-foreground">
                  Không có món nào
                </div>
              ) : (
                order.items.map((item) => (
                  <div key={item.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="text-sm font-medium">
                          {item.item_name}
                        </span>
                        {item.variant_name && (
                          <p className="text-xs text-muted-foreground">
                            {item.variant_name}
                          </p>
                        )}
                      </div>
                      <span className="text-sm font-medium">
                        x{item.quantity}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {formatVND(item.unit_price)}
                      </span>
                      <span className="font-mono font-medium">
                        {formatVND(item.subtotal)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="hidden rounded-md border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="py-2">{PRODUCT_VI.posItem}</TableHead>
                    <TableHead className="py-2 text-center w-12">SL</TableHead>
                    <TableHead className="py-2 text-right">{FORM_VI.price}</TableHead>
                    <TableHead className="py-2 text-right">T.Tiền</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="py-6 text-center text-sm text-muted-foreground"
                      >
                        Không có món nào
                      </TableCell>
                    </TableRow>
                  )}
                  {order.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="py-2">
                        <div>
                          <span className="text-sm font-medium">
                            {item.item_name}
                          </span>
                          {item.variant_name && (
                            <p className="text-xs text-muted-foreground">
                              {item.variant_name}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-center text-sm">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono text-sm">
                        {formatVND(item.unit_price)}
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono text-sm font-medium">
                        {formatVND(item.subtotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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
                <span className="text-muted-foreground">Phí dịch vụ</span>
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
                  <li
                    key={entry.id}
                    className="rounded-md border p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{entry.label}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {new Date(entry.at).toLocaleString("vi-VN", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Bởi <span className="font-medium text-foreground">{entry.by_name}</span>
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
