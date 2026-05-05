"use client";

import { AppEmptyState } from "@/components/surface";
import { cn } from "@comtammatu/ui";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { ChefHat as IconChefHat } from "lucide-react";
import { OrderCard } from "../order-card";
import type { KdsOrder } from "../types";
import type { KdsViewMode } from "../hooks/use-kds-view-mode";

interface OrderGridProps {
  displayOrders: KdsOrder[];
  hasGroupedOrders: boolean;
  pendingTicketIds: Set<number>;
  mode: KdsViewMode;
  canMarkReady: boolean;
  canRecall: boolean;
  onBump: (ticketId: number) => Promise<void>;
  onRecall: (ticketId: number) => Promise<void>;
}

export function OrderGrid({
  displayOrders,
  hasGroupedOrders,
  pendingTicketIds,
  mode,
  canMarkReady,
  canRecall,
  onBump,
  onRecall,
}: OrderGridProps) {
  const gridClass =
    mode === "focus"
      ? "mx-auto grid w-full max-w-2xl grid-cols-1 gap-3 p-2 sm:max-w-3xl sm:gap-4 sm:p-3 md:max-w-4xl md:p-4"
      : "columns-1 gap-2 p-2 sm:columns-2 sm:gap-3 sm:p-3 lg:columns-3 xl:columns-4 xl:p-4 2xl:columns-5";
  return (
    <ScrollArea className="min-h-0 flex-1">
      {displayOrders.length === 0 ? (
        <div className="flex min-h-80 items-center justify-center p-6 md:min-h-96">
          <AppEmptyState
            title={
              hasGroupedOrders
                ? "Không có đơn phù hợp bộ lọc"
                : "Bếp đang rảnh"
            }
            description={
              hasGroupedOrders
                ? "Thay đổi bộ lọc để xem thêm đơn."
                : "Chưa có đơn hàng mới."
            }
            icon={<IconChefHat />}
          />
        </div>
      ) : (
        <div className={cn(gridClass)}>
          {displayOrders.map((order) => (
            <OrderCard
              key={order.groupKey}
              order={order}
              onBump={onBump}
              onRecall={onRecall}
              pendingTicketIds={pendingTicketIds}
              canMarkReady={canMarkReady}
              canRecall={canRecall}
              className={
                mode === "focus" ? undefined : "mb-2 break-inside-avoid sm:mb-3"
              }
            />
          ))}
        </div>
      )}
    </ScrollArea>
  );
}
