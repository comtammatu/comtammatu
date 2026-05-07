"use client";

import { AppEmptyState } from "@/components/surface";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { ChefHat as IconChefHat } from "lucide-react";
import { OrderCard } from "../order-card";
import type { KdsOrder } from "../types";

interface OrderGridProps {
  displayOrders: KdsOrder[];
  hasGroupedOrders: boolean;
  pendingTicketIds: Set<number>;
  canMarkReady: boolean;
  canRecall: boolean;
  onBump: (ticketId: number) => Promise<void>;
  onRecall: (ticketId: number) => Promise<void>;
}

/** Comprehensive (TOÀN DIỆN) view: masonry grid of order cards. */
export function OrderGrid({
  displayOrders,
  hasGroupedOrders,
  pendingTicketIds,
  canMarkReady,
  canRecall,
  onBump,
  onRecall,
}: OrderGridProps) {
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
        <div className="columns-1 gap-2 p-2 sm:columns-2 sm:gap-3 sm:p-3 lg:columns-3 xl:columns-4 xl:p-4 2xl:columns-5">
          {displayOrders.map((order) => (
            <OrderCard
              key={order.groupKey}
              order={order}
              onBump={onBump}
              onRecall={onRecall}
              pendingTicketIds={pendingTicketIds}
              canMarkReady={canMarkReady}
              canRecall={canRecall}
              className="mb-2 break-inside-avoid sm:mb-3"
            />
          ))}
        </div>
      )}
    </ScrollArea>
  );
}
