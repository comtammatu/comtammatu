"use client";

import type { ReactNode } from "react";
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
import { Receipt as IconReceipt } from "lucide-react";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { formatVND } from "@comtammatu/shared/format";
import type { BillReceiptIntent } from "./_components/bill/bill-receipt-types";

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

type OrderStatusInfo = {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline" | "success";
};

const STATUS_LABELS: Record<string, OrderStatusInfo> = {
  new: { label: "Mới", variant: "default" },
  confirmed: { label: "Xác nhận", variant: "default" },
  preparing: { label: "Đang làm", variant: "secondary" },
  ready: { label: "Sẵn sàng", variant: "outline" },
  served: { label: "Đã phục vụ", variant: "outline" },
  completed: { label: "Đã thanh toán", variant: "success" },
  cancelled: { label: "Đã hủy", variant: "destructive" },
};

function getStatusInfo(order: SessionOrder): OrderStatusInfo {
  if (order.status === "cancelled") {
    return { label: "Đã hủy", variant: "destructive" };
  }

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

function getOrderMetaLabel(order: SessionOrder): string {
  return `${getOrderContextLabel(order)} - ${formatTime(order.created_at)}`;
}

function compareOrdersNewestFirst(a: SessionOrder, b: SessionOrder): number {
  const byCreatedAt = Date.parse(b.created_at) - Date.parse(a.created_at);
  if (byCreatedAt !== 0) return byCreatedAt;

  return b.id - a.id;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getOrderContextLabel(order: SessionOrder): string {
  if (order.order_type === "dine_in") {
    return `Bàn ${order.tables?.number ?? "—"}`;
  }

  return "Mang về";
}

function OrderStatusBadge({ order }: { order: SessionOrder }) {
  const statusInfo = getStatusInfo(order);

  return (
    <Badge
      variant={statusInfo.variant}
      className={cn(
        "text-sm font-semibold",
        statusInfo.variant === "outline" && "bg-background",
      )}
    >
      {statusInfo.label}
    </Badge>
  );
}

function OrderCardSummary({
  order,
  amountClassName,
  rightMeta,
}: {
  order: SessionOrder;
  amountClassName?: string;
  rightMeta: ReactNode;
}) {
  return (
    <ItemContent className="w-full min-w-0 gap-1.5">
      <ItemTitle className="w-full min-w-0 justify-between gap-3 text-base">
        <span className="min-w-0 truncate">#{order.order_number}</span>
        <span
          className={cn(
            "shrink-0 text-right font-bold tabular-nums",
            amountClassName ?? "text-foreground",
          )}
        >
          {formatVND(order.total_amount)}
        </span>
      </ItemTitle>
      <ItemDescription className="flex w-full min-w-0 items-center justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{getOrderMetaLabel(order)}</span>
        <span className="flex shrink-0 items-center justify-end gap-1">
          {rightMeta}
        </span>
      </ItemDescription>
    </ItemContent>
  );
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
  onViewBill: (orderId: number, intent?: BillReceiptIntent) => void;
  onViewDetail: (orderId: number, orderNumber: string) => void;
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
  const activeOrderIds = new Set(activeOrders.map((order) => order.id));
  const archivedOrders = orders
    .filter((order) => !activeOrderIds.has(order.id))
    .sort(compareOrdersNewestFirst);

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
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <p className="text-base font-semibold text-foreground">
                  Cần xử lý
                </p>
                <Badge
                  variant={activeOrders.length > 0 ? "warning" : "outline"}
                  className="text-sm"
                >
                  {activeOrders.length}
                </Badge>
              </div>
            </div>

            {activeOrders.length === 0 ? (
              <Empty className="min-h-16 flex-none rounded-md border p-3">
                <EmptyHeader>
                  <EmptyTitle>Không có đơn cần xử lý</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <ItemGroup className="gap-2">
                {activeOrders.map((order) => {
                  const waitingPayment = order.payment_status !== "paid";

                  return (
                    <Item
                      key={order.id}
                      data-testid={`pos-order-card-${order.id}`}
                      variant="outline"
                      size="sm"
                      role="listitem"
                      className="bg-card"
                    >
                      <OrderCardSummary
                        order={order}
                        amountClassName="text-primary"
                        rightMeta={
                          <>
                            <OrderStatusBadge order={order} />
                            {waitingPayment ? (
                              <Badge
                                variant="warning"
                                className="text-sm font-semibold"
                              >
                                Chờ thanh toán
                              </Badge>
                            ) : null}
                          </>
                        }
                      />
                      <ItemFooter className="mt-1.5 justify-end border-t border-border/60 pt-2">
                        <Button
                          data-testid={`pos-order-detail-${order.id}`}
                          variant="outline"
                          size="sm"
                          className="h-10 px-3 text-sm"
                          onClick={() =>
                            onViewDetail(order.id, order.order_number)
                          }
                        >
                          Xử lý đơn
                        </Button>
                        <Button
                          data-testid={`pos-order-bill-${order.id}`}
                          variant="default"
                          size="sm"
                          className="h-10 px-3 text-sm"
                          onClick={() => onViewBill(order.id, "payment")}
                        >
                          <IconReceipt data-icon="inline-start" />
                          Thanh toán
                        </Button>
                      </ItemFooter>
                    </Item>
                  );
                })}
              </ItemGroup>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <p className="text-base font-semibold text-foreground">
                  Đã xử lý
                </p>
                <Badge variant="secondary" className="text-sm">
                  {archivedOrders.length}
                </Badge>
              </div>
            </div>

            {archivedOrders.length === 0 ? (
              <Empty className="min-h-16 flex-none rounded-md border p-3">
                <EmptyHeader>
                  <EmptyTitle>Chưa có đơn đã xử lý</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <ItemGroup className="gap-2">
                {archivedOrders.map((order) => (
                  <Item
                    key={order.id}
                    data-testid={`pos-order-bill-${order.id}`}
                    variant="outline"
                    size="sm"
                    role="button"
                    tabIndex={0}
                    aria-label={`Mở hóa đơn #${order.order_number}`}
                    className="cursor-pointer bg-card transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
                    onClick={() => onViewBill(order.id, "receipt")}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      onViewBill(order.id, "receipt");
                    }}
                  >
                    <OrderCardSummary
                      order={order}
                      rightMeta={<OrderStatusBadge order={order} />}
                    />
                  </Item>
                ))}
              </ItemGroup>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
