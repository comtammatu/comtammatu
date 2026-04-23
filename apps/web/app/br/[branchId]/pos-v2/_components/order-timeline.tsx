"use client";

import { useMemo } from "react";
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
import { IconCircleCheck, IconCircleDot, IconCircleDashed, IconClock, IconCreditCard, IconReceipt, IconToolsKitchen } from "@tabler/icons-react";
import { formatVND } from "@comtammatu/shared/format";
import type { SessionOrder } from "../../pos/order-history";
import { useSwipeReveal } from "../_lib/use-swipe-reveal";

interface OrderTimelineProps {
  orders: SessionOrder[];
  onViewBill: (orderId: number) => void;
  onViewDetail: (orderId: number) => void;
}

interface StatusMeta {
  label: string;
  dotClass: string;
  badgeVariant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
  order: number;
}

const STATUS: Record<string, StatusMeta> = {
  new: { label: "Mới", dotClass: "bg-primary", badgeVariant: "default", order: 0 },
  confirmed: { label: "Đã xác nhận", dotClass: "bg-primary", badgeVariant: "default", order: 1 },
  preparing: { label: "Đang làm", dotClass: "bg-warning", badgeVariant: "warning", order: 2 },
  ready: { label: "Sẵn sàng", dotClass: "bg-success", badgeVariant: "success", order: 3 },
  served: { label: "Đã phục vụ", dotClass: "bg-success", badgeVariant: "success", order: 4 },
  completed: { label: "Hoàn thành", dotClass: "bg-muted-foreground", badgeVariant: "secondary", order: 5 },
  cancelled: { label: "Đã hủy", dotClass: "bg-destructive", badgeVariant: "destructive", order: 6 },
};

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OrderTimeline({
  orders,
  onViewBill,
  onViewDetail,
}: OrderTimelineProps) {
  const sorted = useMemo(() => {
    return [...orders].sort((a, b) => {
      const sa = STATUS[a.status]?.order ?? 99;
      const sb = STATUS[b.status]?.order ?? 99;
      if (sa !== sb) return sa - sb;
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });
  }, [orders]);

  if (orders.length === 0) {
    return (
      <Empty className="flex-1 px-6">
        <EmptyMedia variant="icon">
          <IconReceipt />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>Chưa có đơn trong ca</EmptyTitle>
          <EmptyDescription>
            Đơn hàng mới sẽ xuất hiện ở đây theo thời gian thực.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <ol className="relative flex flex-col gap-3 py-4 pl-8 pr-4" aria-label="Timeline đơn hàng">
        <span
          aria-hidden
          className="absolute bottom-4 left-[1.375rem] top-4 w-px bg-border"
        />
        {sorted.map((order) => (
          <TimelineRow
            key={order.id}
            order={order}
            onViewBill={onViewBill}
            onViewDetail={onViewDetail}
          />
        ))}
      </ol>
    </ScrollArea>
  );
}

interface TimelineRowProps {
  order: SessionOrder;
  onViewBill: (orderId: number) => void;
  onViewDetail: (orderId: number) => void;
}

function TimelineRow({ order, onViewBill, onViewDetail }: TimelineRowProps) {
  const meta = STATUS[order.status] ?? STATUS.new!;
  const canPay =
    order.payment_status !== "paid" &&
    ["ready", "served", "completed"].includes(order.status);
  const Icon =
    order.status === "completed"
      ? IconCircleCheck
      : order.status === "preparing"
        ? IconCircleDashed
        : IconCircleDot;

  const swipe = useSwipeReveal({
    direction: "right",
    disabled: !canPay,
    threshold: 48,
    revealWidth: 96,
  });

  return (
    <li className="relative">
      <span
        aria-hidden
        className={cn(
          "absolute -left-[1.375rem] top-5 flex size-6 -translate-x-1/2 items-center justify-center rounded-full ring-4 ring-background",
          meta.dotClass,
        )}
      >
        <Icon className="size-3.5 text-white" />
      </span>

      <div className="relative overflow-hidden rounded-xl border bg-card shadow-sm">
        {canPay && (
          <div className="absolute inset-y-0 left-0 flex w-24 items-center justify-center bg-success/15">
            <Button
              type="button"
              size="sm"
              variant="default"
              className="gap-1.5"
              onClick={() => {
                swipe.close();
                onViewBill(order.id);
              }}
              aria-label={`Mở hóa đơn đơn ${order.order_number}`}
            >
              <IconCreditCard className="size-4" />
              Thu tiền
            </Button>
          </div>
        )}

        <button
          type="button"
          {...swipe.handlers}
          onClick={(e) => {
            if (swipe.isDragging) {
              e.preventDefault();
              return;
            }
            if (swipe.revealed) {
              swipe.close();
              return;
            }
            onViewDetail(order.id);
          }}
          className="block w-full bg-card p-4 text-left transition"
          style={{
            transform: `translateX(${String(swipe.offset)}px)`,
            transition: swipe.isDragging ? "none" : "transform 180ms ease-out",
            touchAction: "pan-y",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold tracking-tight">
                #{order.order_number}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <IconClock className="size-3" />
                  {formatTime(order.created_at)}
                </span>
                <span className="inline-flex items-center gap-1">
                  {order.order_type === "takeaway" ? (
                    <>
                      <IconReceipt className="size-3" />
                      Mang về
                    </>
                  ) : (
                    <>
                      <IconToolsKitchen className="size-3" />
                      Bàn {order.tables?.number ?? "?"}
                    </>
                  )}
                </span>
              </p>
            </div>
            <Badge variant={meta.badgeVariant} className="shrink-0 text-[11px]">
              {meta.label}
            </Badge>
          </div>

          <div className="mt-3 flex items-end justify-between gap-2">
            <span className="text-base font-bold tabular-nums text-primary">
              {formatVND(order.total_amount)}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {order.payment_status === "paid"
                ? "Đã thanh toán"
                : canPay
                  ? "Vuốt phải để thu tiền"
                  : "Chờ phục vụ"}
            </span>
          </div>
        </button>
      </div>
    </li>
  );
}
