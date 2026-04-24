"use client";

import { cn } from "@comtammatu/ui";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { IconChefHat } from "@tabler/icons-react";
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
      : "grid grid-cols-1 gap-2 p-2 sm:grid-cols-2 sm:gap-3 sm:p-3 lg:grid-cols-3 xl:grid-cols-4 xl:p-4 2xl:grid-cols-5";
  return (
    <ScrollArea className="flex-1">
      {displayOrders.length === 0 ? (
        <div className="flex min-h-80 items-center justify-center p-6 md:min-h-96">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconChefHat />
              </EmptyMedia>
              <EmptyTitle>
                {hasGroupedOrders
                  ? "Không có đơn phù hợp bộ lọc"
                  : "Bếp đang rảnh"}
              </EmptyTitle>
              <EmptyDescription>
                {hasGroupedOrders
                  ? "Thay đổi bộ lọc để xem thêm đơn."
                  : "Chưa có đơn hàng mới."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <div className={cn(gridClass)}>
          {displayOrders.map((order) => (
            <OrderCard
              key={order.orderId}
              order={order}
              onBump={onBump}
              onRecall={onRecall}
              pendingTicketIds={pendingTicketIds}
              canMarkReady={canMarkReady}
              canRecall={canRecall}
            />
          ))}
        </div>
      )}
    </ScrollArea>
  );
}
