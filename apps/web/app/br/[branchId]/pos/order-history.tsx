"use client";

import { cn } from "@comtammatu/ui";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import {
  Package as IconPackage,
  Receipt as IconReceipt,
  Utensils as IconToolsKitchen,
} from "lucide-react";
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
    variant: "default" | "secondary" | "destructive" | "outline" | "success";
  }
> = {
  new: { label: "Mới", variant: "default" },
  confirmed: { label: "Xác nhận", variant: "default" },
  preparing: { label: "Đang làm", variant: "secondary" },
  ready: { label: "Sẵn sàng", variant: "outline" },
  served: { label: "Đã phục vụ", variant: "outline" },
  completed: { label: "Đã thanh toán", variant: "success" },
  cancelled: { label: "Đã hủy", variant: "destructive" },
};

function getStatusInfo(order: SessionOrder) {
  if (order.payment_status === "paid") {
    return { label: "Đã thanh toán", variant: "success" as const };
  }

  return (
    STATUS_LABELS[order.status] ?? {
      label: order.status,
      variant: "outline" as const,
    }
  );
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const ACTIVE_POS_STATUSES = [
  "new",
  "confirmed",
  "preparing",
  "ready",
  "served",
];

interface OrderHistoryProps {
  orders: SessionOrder[];
  onViewBill: (orderId: number) => void;
  /** `summary` is the row the cashier just tapped — used by OrderDetailSheet
   * to render the header (bàn, type, số đơn) instantly while items fetch. */
  onViewDetail: (
    orderId: number,
    orderNumber: string,
    summary: SessionOrder,
  ) => void;
}

export function OrderHistory({
  orders,
  onViewBill,
  onViewDetail,
}: OrderHistoryProps) {
  const activeOrders = orders.filter(
    (order) =>
      ACTIVE_POS_STATUSES.includes(order.status) &&
      order.payment_status !== "paid",
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
          <EmptyTitle>Chưa có đơn trong ca</EmptyTitle>
          <EmptyDescription>
            Đơn cần xử lý và đơn đã thanh toán sẽ xuất hiện tại đây.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        <div className="flex flex-col gap-2 px-3 pb-24 pt-2 md:p-2">
          <section className="flex flex-col gap-2">
            {activeOrders.length === 0 ? (
              <Empty className="min-h-24 border">
                <EmptyHeader>
                  <EmptyTitle>Không có đơn cần xử lý</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex flex-col gap-2">
                {activeOrders.map((order) => {
                  const statusInfo = getStatusInfo(order);
                  const waitingPayment = order.payment_status !== "paid";

                  return (
                    <Card
                      key={order.id}
                      data-testid={`pos-order-card-${order.id}`}
                      size="sm"
                      className="hover:shadow-md"
                    >
                      <CardContent className="flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-base font-semibold tracking-tight text-foreground">
                                #{order.order_number}
                              </span>
                              <Badge
                                variant={statusInfo.variant}
                                className={cn(
                                  "text-sm font-semibold",
                                  statusInfo.variant === "outline" &&
                                    "bg-background",
                                )}
                              >
                                {statusInfo.label}
                              </Badge>
                              {waitingPayment && (
                                <Badge
                                  variant="outline"
                                  className="border-warning/20 bg-warning/10 text-warning"
                                >
                                  Chờ thanh toán
                                </Badge>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
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
                          <p className="shrink-0 text-right text-lg font-bold text-primary">
                            {formatVND(order.total_amount)}
                          </p>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                          <Button
                            data-testid={`pos-order-detail-${order.id}`}
                            variant="outline"
                            size="sm"
                            className="h-10 px-3 text-sm"
                            onClick={() =>
                              onViewDetail(order.id, order.order_number, order)
                            }
                          >
                            Xử lý đơn
                          </Button>
                          <Button
                            data-testid={`pos-order-bill-${order.id}`}
                            variant={waitingPayment ? "default" : "ghost"}
                            size="sm"
                            className="h-10 px-3 text-sm"
                            onClick={() => onViewBill(order.id)}
                          >
                            <IconReceipt data-icon="inline-start" />
                            {waitingPayment ? "Thanh toán" : "Hóa đơn POS"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <p className="text-base font-semibold text-foreground">
                  Đã thanh toán / đã hủy
                </p>
                <Badge variant="success" className="text-sm">
                  {archivedOrders.length}
                </Badge>
              </div>
            </div>

            {archivedOrders.length === 0 ? (
              <Empty className="min-h-20 border">
                <EmptyHeader>
                  <EmptyTitle>Chưa có đơn đã xử lý</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex flex-col gap-2">
                {archivedOrders.map((order) => {
                  const statusInfo = getStatusInfo(order);

                  return (
                    <Card
                      key={order.id}
                      size="sm"
                      className="bg-background hover:shadow-md"
                    >
                      <CardContent className="flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-base font-semibold tracking-tight text-foreground">
                                #{order.order_number}
                              </span>
                              <Badge
                                variant={statusInfo.variant}
                                className={cn(
                                  "text-sm font-semibold",
                                  statusInfo.variant === "outline" &&
                                    "bg-background",
                                )}
                              >
                                {statusInfo.label}
                              </Badge>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
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

                        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-10 px-3 text-sm"
                            onClick={() => onViewBill(order.id)}
                          >
                            <IconReceipt data-icon="inline-start" />
                            Hóa đơn POS
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
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
