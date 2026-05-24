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
        "flex items-start justify-between gap-3 border-b px-3 py-3.5 md:px-4",
        bgClass,
      )}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-mono text-2xl font-semibold leading-none tabular-nums md:text-3xl">
            {kitchenTicketNumber}
          </span>
          {isAppend && (
            <Badge
              variant="destructive"
              className="px-2 py-1 text-xs font-semibold"
            >
              Gọi thêm
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {tableNumber !== null && (
            <Badge
              variant="secondary"
              className="px-2.5 py-1 text-sm font-semibold"
            >
              Bàn {tableNumber}
            </Badge>
          )}
          <Badge
            variant="outline"
            className="px-2.5 py-1 text-sm font-semibold"
          >
            {typeLabel}
          </Badge>
          {sendSeq !== null && (
            <Badge
              variant={isAppend ? "destructive" : "secondary"}
              className="px-2.5 py-1 text-sm font-semibold"
            >
              Lần {sendSeq}
            </Badge>
          )}
          <Badge
            variant="outline"
            className="px-2 py-0.5 font-mono text-xs font-semibold"
          >
            HĐ {orderNumber}
          </Badge>
        </div>
      </div>

      <AgeBadge elapsedMinutes={elapsedMinutes} isComplete={isComplete} />
    </CardHeader>
  );
}
