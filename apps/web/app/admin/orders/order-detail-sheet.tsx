"use client";

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
import type { OrderRow } from "./actions";
import { StatusBadge } from "@/components/foundation/ui-patterns";

/* ─── Helpers ─── */

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Chờ xử lý",
  in_progress: "Đang làm",
  ready: "Sẵn sàng",
  completed: "Hoàn thành",
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
  refunded: "Hoàn tiền",
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
            <span className="text-muted-foreground">Trạng thái</span>
            <div>
              <StatusBadge tone={orderStatusTone(order.status)}>
                {ORDER_STATUS_LABELS[order.status] ?? order.status}
              </StatusBadge>
            </div>

            <span className="text-muted-foreground">Chi nhánh</span>
            <span>{order.branch_name}</span>

            <span className="text-muted-foreground">Nhân viên</span>
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
                    <TableHead className="py-2">Món</TableHead>
                    <TableHead className="py-2 text-center w-12">SL</TableHead>
                    <TableHead className="py-2 text-right">Giá</TableHead>
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
              <span className="text-muted-foreground">Tạm tính</span>
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
                <span className="text-muted-foreground">Thuế</span>
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
              <span>Tổng cộng</span>
              <span className="font-mono">{formatVND(order.total_amount)}</span>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
