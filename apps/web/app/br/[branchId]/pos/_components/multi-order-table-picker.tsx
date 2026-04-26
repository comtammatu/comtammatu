"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@comtammatu/ui/components/drawer";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { formatVND } from "@comtammatu/shared/format";
import { Plus as IconPlus } from "lucide-react";
import type { SessionOrder } from "../order-history";
import { getPosOrderStatusInfo } from "../_lib/order-status-display";

interface MultiOrderTablePickerProps {
  open: boolean;
  tableNumber: number | null;
  orders: SessionOrder[];
  onOpenOrder: (orderId: number, orderNumber: string) => void;
  onCreateNew: () => void;
  onClose: () => void;
}

export function MultiOrderTablePicker({
  open,
  tableNumber,
  orders,
  onOpenOrder,
  onCreateNew,
  onClose,
}: MultiOrderTablePickerProps) {
  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="mx-auto max-w-md sm:max-w-lg">
        <DrawerHeader>
          <DrawerTitle>
            Bàn {tableNumber ?? "—"} — {orders.length} đơn
          </DrawerTitle>
          <DrawerDescription>
            Chọn đơn để xem chi tiết, hoặc tạo đơn mới trên bàn này.
          </DrawerDescription>
        </DrawerHeader>

        <ScrollArea className="max-h-72 px-4">
          <div className="flex flex-col gap-2 pr-2 pb-2">
            {orders.map((order) => {
              const statusInfo = getPosOrderStatusInfo(order);
              return (
                <Button
                  key={order.id}
                  type="button"
                  variant="outline"
                  onClick={() => onOpenOrder(order.id, order.order_number)}
                  className="h-auto w-full justify-between p-3 text-left whitespace-normal transition-colors hover:border-primary/40 hover:bg-accent"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="truncate text-sm font-semibold">
                      {order.order_number}
                    </p>
                    <Badge
                      variant={statusInfo.variant}
                      className="w-fit text-xs tabular-nums"
                    >
                      {statusInfo.label}
                    </Badge>
                  </div>
                  <p className="shrink-0 text-base font-semibold tabular-nums">
                    {formatVND(order.total_amount)}
                  </p>
                </Button>
              );
            })}
          </div>
        </ScrollArea>

        <DrawerFooter className="pos-safe-bottom">
          <Button
            type="button"
            variant="default"
            className="w-full"
            onClick={onCreateNew}
          >
            <IconPlus data-icon="inline-start" />
            Tạo đơn mới trên bàn này
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Đóng
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
