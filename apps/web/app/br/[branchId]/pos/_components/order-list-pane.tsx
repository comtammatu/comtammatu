"use client";

import { memo } from "react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { RefreshCw as IconRefresh, X as IconX } from "lucide-react";
import { OrderHistory } from "../order-history";
import type { BillReceiptIntent } from "./bill/bill-receipt-types";
import {
  usePosOperationalDispatch,
  usePosOrders,
} from "../_providers/pos-desktop-provider";

interface OrderListPaneProps {
  onViewBill: (orderId: number, intent?: BillReceiptIntent) => void;
  onViewDetail: (orderId: number, orderNumber: string) => void;
  onClosePane?: () => void;
}

function OrderListPaneComponent({
  onViewBill,
  onViewDetail,
  onClosePane,
}: OrderListPaneProps) {
  const orders = usePosOrders();
  const { refreshOrders } = usePosOperationalDispatch();
  const activeOrderCount = orders.filter(
    (order) =>
      ["new", "confirmed", "preparing", "ready", "served"].includes(
        order.status,
      ) && order.payment_status !== "paid",
  ).length;
  const archivedOrderCount = orders.length - activeOrderCount;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-2">
        <div className="min-w-0">
          <p className="font-semibold">Đơn trong ca</p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Badge
              variant={activeOrderCount > 0 ? "warning" : "outline"}
              className="text-sm"
            >
              Cần xử lý {activeOrderCount}
            </Badge>
            <Badge variant="secondary" className="text-sm">
              Đã xong {archivedOrderCount}
            </Badge>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-10 px-3 text-sm"
            aria-label="Tải lại danh sách đơn trong ca"
            onClick={() => void refreshOrders()}
          >
            <IconRefresh data-icon="inline-start" />
            Tải lại
          </Button>
          {onClosePane ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label="Đóng danh sách đơn"
              onClick={onClosePane}
            >
              <IconX />
            </Button>
          ) : null}
        </div>
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
