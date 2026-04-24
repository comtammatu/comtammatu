"use client";

import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { CardHeader } from "@comtammatu/ui/components/card";
import { getOrderTypeLabel } from "../lib/status-config";
import { AgeBadge } from "./age-badge";

interface OrderCardHeaderProps {
  orderNumber: string;
  orderType: string;
  tableNumber: number | null;
  elapsedMinutes: number;
  isComplete: boolean;
  bgClass: string;
}

export function OrderCardHeader({
  orderNumber,
  orderType,
  tableNumber,
  elapsedMinutes,
  isComplete,
  bgClass,
}: OrderCardHeaderProps) {
  const typeLabel = getOrderTypeLabel(orderType);

  return (
    <CardHeader
      className={cn(
        "flex items-start justify-between gap-2 border-b px-3 py-3 md:px-4",
        bgClass,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xl font-black leading-none tabular-nums md:text-2xl">
          {orderNumber}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
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
        </div>
      </div>

      <AgeBadge elapsedMinutes={elapsedMinutes} isComplete={isComplete} />
    </CardHeader>
  );
}
