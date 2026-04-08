"use client";

import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Receipt, UtensilsCrossed, Package } from "lucide-react";
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
  if (orders.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
        <Receipt className="size-10 opacity-30" />
        <p className="text-sm">Chưa có đơn hàng</p>
        <p className="text-xs">Đơn hàng trong ca sẽ hiển thị tại đây</p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-1.5 p-2">
        {orders.map((order) => {
          const statusInfo = STATUS_LABELS[order.status] ?? {
            label: order.status,
            variant: "outline" as const,
          };
          return (
            <div key={order.id} className="rounded-md border bg-card p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  #{order.order_number}
                </span>
                <Badge variant={statusInfo.variant} className="text-xs">
                  {statusInfo.label}
                </Badge>
              </div>

              <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                <span>{formatTime(order.created_at)}</span>
                <span className="flex items-center gap-0.5">
                  {order.order_type === "dine_in" ? (
                    <>
                      <UtensilsCrossed className="size-3" />
                      Bàn {order.tables?.number ?? "—"}
                    </>
                  ) : (
                    <>
                      <Package className="size-3" />
                      Mang về
                    </>
                  )}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-primary">
                  {formatVND(order.total_amount)}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 min-h-9 min-w-18 text-xs"
                    onClick={() => onViewDetail(order.id)}
                  >
                    Chi tiết
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 min-h-9 min-w-18 text-xs"
                    onClick={() => onViewBill(order.id)}
                  >
                    <Receipt className="mr-1 size-3" />
                    Hóa đơn
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
