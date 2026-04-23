"use client";

import { cn } from "@comtammatu/ui";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import {
  IconPackage,
  IconReceipt,
  IconToolsKitchen,
} from "@tabler/icons-react";
import { formatVND } from "@comtammatu/shared/format";

export interface SessionOrder {
  id: number;
  order_number: string;
  order_type: string;
  status: string;
  payment_status: string | null;
  total_amount: number;
  table_id: number | null;
  created_at: string;
  tables: { number: number } | null;
}

const STATUS_LABELS: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  new: { label: "Mới", variant: "default" },
  confirmed: { label: "Xác nhận", variant: "default" },
  preparing: { label: "Đang làm", variant: "secondary" },
  ready: { label: "Sẵn sàng", variant: "outline" },
  served: { label: "Đã phục vụ", variant: "outline" },
  completed: { label: "Hoàn thành", variant: "secondary" },
  cancelled: { label: "Đã hủy", variant: "destructive" },
};

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface OrderHistoryProps {
  orders: SessionOrder[];
  onViewBill: (orderId: number) => void;
  onViewDetail: (orderId: number) => void;
}

export function OrderHistory({
  orders,
  onViewBill,
  onViewDetail,
}: OrderHistoryProps) {
  const activeOrders = orders.filter((order) =>
    ["new", "confirmed", "preparing", "ready", "served"].includes(order.status),
  );
  const archivedOrders = orders.filter(
    (order) => !activeOrders.some((active) => active.id === order.id),
  );

  if (orders.length === 0) {
    return (
      <Empty className="flex-1 px-6">
        <EmptyMedia variant="icon">
          <IconReceipt />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>Chưa có đơn hàng</EmptyTitle>
          <EmptyDescription>
            Các đơn trong ca sẽ xuất hiện tại đây để staff tra cứu lại nhanh.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      <ScrollArea className="flex-1">
        <div className="space-y-5 p-4">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Đang phục vụ</p>
                <p className="text-xs text-muted-foreground">
                  Ưu tiên các đơn còn đang làm ở bếp hoặc tại bàn.
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                {activeOrders.length}
              </Badge>
            </div>

            {activeOrders.length === 0 ? (
              <Empty className="min-h-32 border">
                <EmptyHeader>
                  <EmptyTitle>Không có đơn đang phục vụ</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="space-y-3">
                {activeOrders.map((order) => {
                  const statusInfo = STATUS_LABELS[order.status] ?? {
                    label: order.status,
                    variant: "outline" as const,
                  };
                  const waitingPayment =
                    order.status === "served" && order.payment_status !== "paid";
                  const readyToCloseTable =
                    order.status === "served" && order.payment_status === "paid";

                  return (
                    <div
                      key={order.id}
                      data-testid={`pos-order-card-${order.id}`}
                      className="rounded-xl border border-border bg-card p-4 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-semibold tracking-tight text-foreground">
                              #{order.order_number}
                            </span>
                            <Badge
                              variant={statusInfo.variant}
                              className={cn(
                                "text-xs font-semibold",
                                statusInfo.variant === "outline" && "bg-background",
                              )}
                            >
                              {statusInfo.label}
                            </Badge>
                            {order.status === "served" && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  waitingPayment
                                    ? "border-warning/20 bg-warning/10 text-warning"
                                    : "border-success/20 bg-success/10 text-success",
                                )}
                              >
                                {waitingPayment
                                  ? "Chờ thanh toán"
                                  : "Đã thu tiền"}
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span>{formatTime(order.created_at)}</span>
                            <span className="flex items-center gap-1">
                              {order.order_type === "dine_in" ? (
                                <>
                                  <IconToolsKitchen className="size-3.5" />
                                  Bàn {order.tables?.number ?? "—"}
                                </>
                              ) : (
                                <>
                                  <IconPackage className="size-3.5" />
                                  Mang về
                                </>
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Tổng đơn
                          </p>
                          <p className="mt-1 text-lg font-bold text-primary">
                            {formatVND(order.total_amount)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                        <Button
                          data-testid={`pos-order-detail-${order.id}`}
                          variant={waitingPayment || readyToCloseTable ? "secondary" : "outline"}
                          size="sm"
                          className="h-10 rounded-full px-4 text-xs"
                          onClick={() => onViewDetail(order.id)}
                        >
                          {readyToCloseTable ? "Hoàn tất" : "Điều phối"}
                        </Button>
                        <Button
                          data-testid={`pos-order-bill-${order.id}`}
                          variant={waitingPayment || readyToCloseTable ? "default" : "ghost"}
                          size="sm"
                          className="h-10 rounded-full px-4 text-xs"
                          onClick={() => onViewBill(order.id)}
                        >
                          <IconReceipt className="mr-1 size-3.5" />
                          {waitingPayment
                            ? "Thanh toán"
                            : readyToCloseTable
                              ? "Trả bàn"
                              : "Hóa đơn"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Đã hoàn tất</p>
                <p className="text-xs text-muted-foreground">
                  Lưu vết đơn đã kết thúc trong ca hiện tại.
                </p>
              </div>
              <Badge variant="success" className="text-xs">
                {archivedOrders.length}
              </Badge>
            </div>

            {archivedOrders.length === 0 ? (
              <Empty className="min-h-32 border">
                <EmptyHeader>
                  <EmptyTitle>Chưa có đơn hoàn tất</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="space-y-3">
                {archivedOrders.map((order) => {
                  const statusInfo = STATUS_LABELS[order.status] ?? {
                    label: order.status,
                    variant: "outline" as const,
                  };

                  return (
                    <div
                      key={order.id}
                      className="rounded-xl border border-border bg-background p-4 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold tracking-tight text-foreground">
                              #{order.order_number}
                            </span>
                            <Badge
                              variant={statusInfo.variant}
                              className={cn(
                                "text-xs font-semibold",
                                statusInfo.variant === "outline" && "bg-background",
                              )}
                            >
                              {statusInfo.label}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span>{formatTime(order.created_at)}</span>
                            <span className="flex items-center gap-1">
                              {order.order_type === "dine_in" ? (
                                <>
                                  <IconToolsKitchen className="size-3.5" />
                                  Bàn {order.tables?.number ?? "—"}
                                </>
                              ) : (
                                <>
                                  <IconPackage className="size-3.5" />
                                  Mang về
                                </>
                              )}
                            </span>
                          </div>
                        </div>
                        <p className="text-base font-bold text-foreground">
                          {formatVND(order.total_amount)}
                        </p>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-10 rounded-full px-4 text-xs"
                          onClick={() => onViewBill(order.id)}
                        >
                          <IconReceipt className="mr-1 size-3.5" />
                          Hóa đơn
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
