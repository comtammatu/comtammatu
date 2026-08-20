"use client";

import { memo, useMemo, type ReactNode } from "react";
import { AppEmptyState, OperationalTile } from "@/components/surface";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  Bike as IconBike,
  Plus as IconPlus,
  ShoppingBag as IconShoppingBag,
} from "lucide-react";
import { messages } from "@lib/messages";
import { formatVND } from "@comtammatu/shared/format";
import { getDeliveryPlatformLabelVi } from "@comtammatu/shared/labels";
import { formatVNTime } from "@comtammatu/shared/time";
import { DeliveryPlatformMark } from "@/components/delivery-platform-mark";
import type { SessionOrder } from "./order-history";
import {
  ACTIVE_POS_STATUSES,
  compareOrdersByNextAction,
} from "./order-history";
import { getPosOrderStatusInfo } from "./_lib/order-status-display";
import { formatGateOrderTileNumber } from "./_lib/delivery-channel";
import type { OrderType } from "./types";

export type PosServiceGateMode = Extract<OrderType, "takeaway" | "delivery">;

interface PosTakeawayGateProps {
  mode?: PosServiceGateMode;
  orders: SessionOrder[];
  onCreateNew: () => void;
  onViewDetail: (
    orderId: number,
    orderNumber: string,
    summary?: SessionOrder,
  ) => void;
  hasStackedTouchActions?: boolean;
  headerAction?: ReactNode;
  className?: string;
}

function isActiveServiceGateOrder(
  order: SessionOrder,
  mode: PosServiceGateMode,
): boolean {
  return (
    order.order_type === mode &&
    order.payment_status !== "paid" &&
    ACTIVE_POS_STATUSES.includes(order.status)
  );
}

function getServiceGateTone(order: SessionOrder) {
  if (order.status === "ready" || order.status === "served") return "success";
  return "warning";
}

function ServiceOrderTile({
  order,
  mode,
  onViewDetail,
}: {
  order: SessionOrder;
  mode: PosServiceGateMode;
  onViewDetail: PosTakeawayGateProps["onViewDetail"];
}) {
  const statusInfo = getPosOrderStatusInfo(order);
  const displayNumber = formatGateOrderTileNumber(order.order_number);
  const customerName = order.note?.trim() ? order.note.trim() : null;
  const platformLabel =
    mode === "delivery"
      ? getDeliveryPlatformLabelVi(order.delivery_platform)
      : null;
  const appRef =
    mode === "delivery" ? order.external_order_ref?.trim() ?? null : null;

  const gateCopy =
    mode === "delivery" ? messages.pos.deliveryGate : messages.pos.takeawayGate;

  return (
    <OperationalTile
      type="button"
      tone={getServiceGateTone(order)}
      size="tile"
      data-testid={`pos-${mode}-order-tile-${order.id}`}
      aria-label={
        mode === "delivery"
          ? messages.pos.deliveryGate.orderAria(
              displayNumber,
              platformLabel ?? "",
              appRef ?? "",
              statusInfo.label,
              formatVND(order.total_amount),
            )
          : customerName
            ? `${messages.pos.takeawayGate.orderAria(
                displayNumber,
                statusInfo.label,
                formatVND(order.total_amount),
              )}, ${messages.pos.takeawayGate.customerName(customerName)}`
            : messages.pos.takeawayGate.orderAria(
                displayNumber,
                statusInfo.label,
                formatVND(order.total_amount),
              )
      }
      className="w-full min-w-0 flex-col items-stretch justify-start gap-1.5 p-2.5 text-left whitespace-normal hover:shadow-effect-card-hover active:scale-[0.98] transition-transform touch-manipulation select-none chrome-tap sm:gap-3 sm:p-3.5 lg:p-4"
      onClick={() => onViewDetail(order.id, order.order_number, order)}
    >
      <div className="flex w-full min-w-0 items-center justify-between gap-1">
        <p className="shrink-0 text-xs font-medium uppercase tracking-wide opacity-60">
          {gateCopy.orderLabel}
        </p>
        <Badge
          variant={statusInfo.variant}
          className="min-w-0 shrink truncate text-xs font-semibold"
        >
          {statusInfo.label}
        </Badge>
      </div>

      <div className="mt-auto flex w-full min-w-0 items-end justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <p className="shrink-0 font-mono text-xl font-semibold leading-none tabular-nums sm:text-2xl">
            {displayNumber}
          </p>
          {mode === "delivery" && platformLabel ? (
            <p className="mt-1 inline-flex max-w-full items-center gap-1.5 truncate text-xs font-medium text-foreground sm:text-sm">
              <DeliveryPlatformMark
                platform={order.delivery_platform}
                size="xs"
              />
              <span className="truncate">
                {platformLabel}
                {appRef ? ` · ${appRef}` : null}
              </span>
            </p>
          ) : customerName ? (
            <p className="mt-1 truncate text-xs font-medium text-foreground sm:text-sm">
              {customerName}
            </p>
          ) : null}
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {formatVNTime(order.created_at)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {order.is_priority ? (
            <Badge variant="warning" className="shrink-0 text-xs font-semibold">
              {gateCopy.priority}
            </Badge>
          ) : null}
          <p className="font-mono text-xs font-semibold tabular-nums text-primary sm:text-sm">
            {formatVND(order.total_amount)}
          </p>
        </div>
      </div>
    </OperationalTile>
  );
}

function PosTakeawayGateComponent({
  mode = "takeaway",
  orders,
  onCreateNew,
  onViewDetail,
  hasStackedTouchActions = false,
  headerAction,
  className,
}: PosTakeawayGateProps) {
  const activeOrders = useMemo(
    () =>
      orders
        .filter((order) => isActiveServiceGateOrder(order, mode))
        .sort(compareOrdersByNextAction),
    [mode, orders],
  );

  const gateCopy =
    mode === "delivery" ? messages.pos.deliveryGate : messages.pos.takeawayGate;
  const GateIcon = mode === "delivery" ? IconBike : IconShoppingBag;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-background",
        className,
      )}
    >
      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        <div
          className={cn(
            "flex w-full flex-col gap-4 px-2 pt-2 md:px-4 md:pt-4",
            hasStackedTouchActions ? "pb-40 xl:pb-4" : "pb-28 xl:pb-4",
          )}
        >
          {headerAction ? (
            <div className="w-full md:max-w-md">{headerAction}</div>
          ) : null}
          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <GateIcon className="size-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-foreground">
                    {gateCopy.title}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 2xl:grid-cols-5">
              <OperationalTile
                type="button"
                tone="default"
                size="tile"
                data-testid={`pos-${mode}-create-tile`}
                aria-label={gateCopy.createNew}
                className="w-full min-w-0 flex-col items-stretch justify-start gap-2 p-3 text-left whitespace-normal hover:shadow-effect-card-hover active:scale-[0.98] transition-transform touch-manipulation select-none chrome-tap sm:gap-3 lg:p-4"
                onClick={onCreateNew}
              >
                <div className="flex w-full min-w-0 items-center justify-between gap-1.5">
                  <p className="shrink-0 text-xs font-medium uppercase tracking-wide opacity-60">
                    {gateCopy.title}
                  </p>
                  <Badge variant="success" className="text-xs font-semibold">
                    {gateCopy.newOrder}
                  </Badge>
                </div>

                <div className="mt-auto flex w-full min-w-0 items-end justify-between gap-2">
                  <p className="text-2xl font-semibold leading-none">
                    {gateCopy.createTileLabel}
                  </p>
                  <IconPlus data-icon="inline-end" />
                </div>
              </OperationalTile>

              {activeOrders.map((order) => (
                <ServiceOrderTile
                  key={order.id}
                  order={order}
                  mode={mode}
                  onViewDetail={onViewDetail}
                />
              ))}
            </div>

            {activeOrders.length === 0 ? (
              <AppEmptyState
                title={gateCopy.empty}
                compact
                icon={<GateIcon />}
              />
            ) : null}
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}

export const PosTakeawayGate = memo(PosTakeawayGateComponent);
