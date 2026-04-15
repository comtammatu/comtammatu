"use client";

import { cn } from "@comtammatu/ui";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  CheckCircle2,
  Clock3,
  Package,
  PackageCheck,
  Receipt,
  UtensilsCrossed,
} from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";

export interface SessionOrder {
  id: number;
  order_number: string;
  order_type: string;
  status: string;
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
  const totalRevenue = orders.reduce((sum, order) => sum + order.total_amount, 0);

  if (orders.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
        <div className="flex size-16 items-center justify-center rounded-full border border-dashed border-border/80 bg-background/70">
          <Receipt className="size-7 opacity-40" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Chưa có đơn hàng</p>
          <p className="text-xs leading-5 text-muted-foreground">
            Các đơn trong ca sẽ xuất hiện tại đây để staff tra cứu lại nhanh.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      <div className="border-b border-border/60 px-4 py-4">
        <div className="rounded-xl border bg-card shadow-sm p-4">
          <div className="relative space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Theo dõi ca</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight">
                  Đơn đang chạy và đơn đã chốt nằm trong cùng một mạch quan sát.
                </h2>
              </div>
              <div className="rounded-full border border-primary/15 bg-card px-3 py-1.5 text-xs font-semibold text-primary shadow-sm">
                {orders.length} đơn
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border bg-card shadow-sm p-3" data-state="current">
                <div className="flex items-start gap-3">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-bold">
                    <Clock3 className="size-3.5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Đang vận hành</p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {activeOrders.length} đơn còn trong flow phục vụ
                    </p>
                  </div>
                </div>
              </div>
              <div
                className="rounded-lg border bg-card shadow-sm p-3"
                data-state={archivedOrders.length > 0 ? "done" : "todo"}
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-bold">
                    <CheckCircle2 className="size-3.5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Đã chốt</p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {archivedOrders.length} đơn đã kết thúc
                    </p>
                  </div>
                </div>
              </div>
              <div
                className="rounded-lg border bg-card shadow-sm p-3"
                data-state={orders.length > 0 ? "done" : "todo"}
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-bold">
                    <PackageCheck className="size-3.5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Tổng doanh thu ca</p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {formatVND(totalRevenue)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-5 p-4">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Đang phục vụ</p>
                <p className="text-xs text-muted-foreground">
                  Ưu tiên đơn còn trong flow bếp và bàn.
                </p>
              </div>
              <span className="rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-xs font-semibold text-primary">
                {activeOrders.length}
              </span>
            </div>

            {activeOrders.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
                Không có đơn đang phục vụ.
              </div>
            ) : (
              <div className="space-y-3">
                {activeOrders.map((order) => {
                  const statusInfo = STATUS_LABELS[order.status] ?? {
                    label: order.status,
                    variant: "outline" as const,
                  };

                  return (
                    <div
                      key={order.id}
                      className="transition-all hover:-translate-y-0.5 hover:shadow-md rounded-xl border border-border bg-card p-4 shadow-sm"
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
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span>{formatTime(order.created_at)}</span>
                            <span className="flex items-center gap-1">
                              {order.order_type === "dine_in" ? (
                                <>
                                  <UtensilsCrossed className="size-3.5" />
                                  Bàn {order.tables?.number ?? "—"}
                                </>
                              ) : (
                                <>
                                  <Package className="size-3.5" />
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
                          variant="outline"
                          size="sm"
                          className="h-10 rounded-full px-4 text-xs"
                          onClick={() => onViewDetail(order.id)}
                        >
                          Chi tiết
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-10 rounded-full px-4 text-xs"
                          onClick={() => onViewBill(order.id)}
                        >
                          <Receipt className="mr-1 size-3.5" />
                          Hóa đơn
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
              <span className="rounded-full border border-success/15 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                {archivedOrders.length}
              </span>
            </div>

            {archivedOrders.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
                Chưa có đơn hoàn tất trong ca này.
              </div>
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
                      className="transition-all hover:-translate-y-0.5 hover:shadow-md rounded-xl border border-border bg-background p-4 shadow-sm"
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
                                  <UtensilsCrossed className="size-3.5" />
                                  Bàn {order.tables?.number ?? "—"}
                                </>
                              ) : (
                                <>
                                  <Package className="size-3.5" />
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
