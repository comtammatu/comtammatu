"use client";

import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { CardHeader } from "@comtammatu/ui/components/card";
import { getOrderTypeLabel } from "../lib/status-config";
import { AgeBadge } from "./age-badge";

interface OrderCardHeaderProps {
  orderNumber: string;
  kitchenTicketNumber: string;
  orderType: string;
  tableNumber: number | null;
  sendSeq: number | null;
  sendKind: string | null;
  elapsedMinutes: number;
  isComplete: boolean;
  bgClass: string;
}

export function OrderCardHeader({
  orderNumber,
  kitchenTicketNumber,
  orderType,
  tableNumber,
  sendSeq,
  sendKind,
  elapsedMinutes,
  isComplete,
  bgClass,
}: OrderCardHeaderProps) {
  const typeLabel = getOrderTypeLabel(orderType);
  const isAppend = sendKind === "append";

  return (
    <CardHeader
      className={cn(
        "flex items-start justify-between gap-2 border-b px-3 py-3 md:px-4",
        bgClass,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xl font-black leading-none tabular-nums md:text-2xl">
          {kitchenTicketNumber}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {isAppend && (
            <Badge
              variant="destructive"
              className="px-2 py-0.5 text-xs font-semibold"
            >
              Gọi thêm
            </Badge>
          )}
          <Badge
            variant="outline"
            className="px-2 py-0.5 text-xs font-semibold"
          >
            HĐ {orderNumber}
          </Badge>
          <Badge
            variant="outline"
            className="px-2 py-0.5 text-xs font-semibold"
          >
            {typeLabel}
          </Badge>
          {tableNumber !== null && (
            <Badge
              variant="secondary"
              className="px-2 py-0.5 text-xs font-semibold"
            >
              Bàn {tableNumber}
            </Badge>
          )}
          {sendSeq !== null && (
            <Badge
              variant="secondary"
              className="px-2 py-0.5 text-xs font-semibold"
            >
              Lần {sendSeq}
            </Badge>
          )}
        </div>
      </div>

      <AgeBadge elapsedMinutes={elapsedMinutes} isComplete={isComplete} />
    </CardHeader>
  );
}
