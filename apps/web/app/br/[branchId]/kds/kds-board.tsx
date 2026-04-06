"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { createClient } from "@comtammatu/database/supabase/client";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { Card } from "@comtammatu/ui/components/card";
import { ChefHat, Clock, Flame, Check } from "lucide-react";
import { bumpItem } from "./actions";
import type { KdsOrderItem } from "./types";

interface KdsBoardProps {
  branchId: number;
  initialItems: KdsOrderItem[];
  selectedStationId: number;
  tenantId: number;
}

export function KdsBoard({
  branchId,
  initialItems,
  selectedStationId,
  tenantId,
}: KdsBoardProps) {
  const [items, setItems] = useState<KdsOrderItem[]>(initialItems);
  const [isPending, startTransition] = useTransition();
  const supabase = createClient();

  // Subscribe to realtime changes on order_items
  useEffect(() => {
    const channel = supabase
      .channel(`kds-${branchId}-${selectedStationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "order_items",
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          // On any change, refetch the queue
          // This is simpler and more reliable than trying to patch state
          window.location.reload();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          window.location.reload();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, branchId, selectedStationId, tenantId]);

  const handleBump = useCallback(
    (itemId: number, currentStatus: string) => {
      startTransition(async () => {
        const result = await bumpItem(itemId, currentStatus);
        if (result.success) {
          // Optimistically update UI
          setItems((prev) =>
            prev
              .map((item) => {
                if (item.id !== itemId) return item;
                const nextStatus =
                  currentStatus === "pending" ? "preparing" : "ready";
                // If bumped to ready, remove from queue
                if (nextStatus === "ready") return null;
                return { ...item, status: nextStatus };
              })
              .filter((item): item is KdsOrderItem => item !== null),
          );
        }
      });
    },
    [],
  );

  // Group items by order
  const orderGroups = new Map<
    number,
    { orderNumber: string; tableNumber: number | null; orderType: string; createdAt: string; items: KdsOrderItem[] }
  >();

  for (const item of items) {
    const existing = orderGroups.get(item.order_id);
    if (existing) {
      existing.items.push(item);
    } else {
      orderGroups.set(item.order_id, {
        orderNumber: item.orders?.order_number ?? `#${item.order_id}`,
        tableNumber: item.orders?.tables?.number ?? null,
        orderType: item.orders?.order_type ?? "dine_in",
        createdAt: item.orders?.created_at ?? item.created_at,
        items: [item],
      });
    }
  }

  const sortedOrders = [...orderGroups.entries()].sort(
    ([, a], [, b]) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  if (sortedOrders.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <ChefHat className="size-16" />
        <p className="text-lg">Không có món nào đang chờ</p>
      </div>
    );
  }

  return (
    <div className="grid auto-rows-min grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {sortedOrders.map(([orderId, order]) => (
        <OrderCard
          key={orderId}
          order={order}
          onBump={handleBump}
          isPending={isPending}
        />
      ))}
    </div>
  );
}

function OrderCard({
  order,
  onBump,
  isPending,
}: {
  order: {
    orderNumber: string;
    tableNumber: number | null;
    orderType: string;
    createdAt: string;
    items: KdsOrderItem[];
  };
  onBump: (itemId: number, currentStatus: string) => void;
  isPending: boolean;
}) {
  const elapsed = getElapsedMinutes(order.createdAt);
  const isUrgent = elapsed >= 10;

  return (
    <Card
      className={`flex flex-col overflow-hidden ${isUrgent ? "border-destructive" : ""}`}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-3 py-2 ${isUrgent ? "bg-destructive text-destructive-foreground" : "bg-muted"}`}
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold">
            {order.orderNumber}
          </span>
          {order.tableNumber ? (
            <Badge variant="secondary">Bàn {order.tableNumber}</Badge>
          ) : (
            <Badge variant="outline">Mang về</Badge>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs">
          {isUrgent ? <Flame className="size-3" /> : <Clock className="size-3" />}
          <span>{elapsed}p</span>
        </div>
      </div>

      {/* Items */}
      <div className="flex flex-1 flex-col divide-y">
        {order.items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 px-3 py-2"
          >
            <div className="flex-1">
              <div className="flex items-center gap-1">
                <span className="font-mono text-sm font-bold">
                  {item.quantity}x
                </span>
                <span className="text-sm font-medium">{item.item_name}</span>
              </div>
              {item.variant_name && (
                <p className="text-xs text-muted-foreground">
                  {item.variant_name}
                </p>
              )}
              {Array.isArray(item.modifiers) &&
                item.modifiers.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    +{" "}
                    {(item.modifiers as { name: string }[])
                      .map((m) => m.name)
                      .join(", ")}
                  </p>
                ) : null}
              {item.note && (
                <p className="text-xs font-medium text-amber-500">
                  📝 {item.note}
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant={item.status === "pending" ? "default" : "secondary"}
              disabled={isPending}
              onClick={() => onBump(item.id, item.status)}
              className="shrink-0"
            >
              {item.status === "pending" ? (
                <>
                  <Flame className="mr-1 size-3" />
                  Bắt đầu
                </>
              ) : (
                <>
                  <Check className="mr-1 size-3" />
                  Xong
                </>
              )}
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function getElapsedMinutes(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}
