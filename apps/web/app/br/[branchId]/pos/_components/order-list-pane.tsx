"use client";

import { memo } from "react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { LogIn as IconDoorEnter } from "lucide-react";
import { OrderHistory } from "../order-history";
import {
  usePosOperationalDispatch,
  usePosOrders,
} from "../_providers/pos-desktop-provider";

interface OrderListPaneProps {
  onViewBill: (orderId: number) => void;
  onViewDetail: (orderId: number, orderNumber: string) => void;
}

function OrderListPaneComponent({
  onViewBill,
  onViewDetail,
}: OrderListPaneProps) {
  const orders = usePosOrders();
  const { refreshOrders } = usePosOperationalDispatch();
  const activeOrderCount = orders.filter(
    (order) =>
      ["new", "confirmed", "preparing", "ready", "served"].includes(
        order.status,
      ) && order.payment_status !== "paid",
  ).length;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Đơn cần xử lý</span>
          {activeOrderCount > 0 && (
            <Badge variant="secondary" className="text-sm">
              {activeOrderCount}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-10 px-3 text-sm"
          onClick={() => void refreshOrders()}
        >
          <IconDoorEnter data-icon="inline-start" />
          Tải lại
        </Button>
      </div>
      <OrderHistory
        orders={orders}
        onViewBill={onViewBill}
        onViewDetail={onViewDetail}
      />
    </div>
  );
}

export const OrderListPane = memo(OrderListPaneComponent);
