"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { IconDoorEnter } from "@tabler/icons-react";
import { OrderHistory } from "../order-history";
import {
  usePosOperationalData,
  usePosOperationalDispatch,
} from "../_providers/pos-desktop-provider";

interface OrderListPaneProps {
  onViewBill: (orderId: number) => void;
  onViewDetail: (orderId: number) => void;
}

export function OrderListPane({
  onViewBill,
  onViewDetail,
}: OrderListPaneProps) {
  const { orders } = usePosOperationalData();
  const { refreshOrders } = usePosOperationalDispatch();

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Đơn đang phục vụ</span>
          {orders.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {orders.length}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 rounded-full px-3 text-xs"
          onClick={() => void refreshOrders()}
        >
          <IconDoorEnter className="mr-1 size-3.5" />
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
