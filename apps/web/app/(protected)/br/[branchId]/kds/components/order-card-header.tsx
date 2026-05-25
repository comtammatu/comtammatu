"use client";

import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { CardHeader } from "@comtammatu/ui/components/card";
import { AgeBadge } from "./age-badge";
import { OrderTitleLine } from "./order-title-line";

const KDS_ORDER_TITLE_LABELS = {
  append: "Gọi thêm",
  priority: "Ưu tiên",
} as const;

interface OrderCardHeaderProps {
  orderNumber: string;
  kitchenTicketNumber: string;
  orderType: string;
  tableNumber: number | null;
  sendKind: string | null;
  elapsedMinutes: number;
  isComplete: boolean;
  isPriority: boolean;
  bgClass: string;
}

export function OrderCardHeader({
  orderNumber,
  kitchenTicketNumber,
  orderType,
  tableNumber,
  sendKind,
  elapsedMinutes,
  isComplete,
  isPriority,
  bgClass,
}: OrderCardHeaderProps) {
  const isAppend = sendKind === "append";
  const hasMeta = isAppend || isPriority;

  return (
    <CardHeader
      className={cn(
        "flex items-start justify-between gap-3 border-b px-3 py-2.5 md:px-4",
        bgClass,
      )}
    >
      <div className="min-w-0 flex-1">
        <OrderTitleLine
          kitchenTicketNumber={kitchenTicketNumber}
          orderNumber={orderNumber}
          orderType={orderType}
          tableNumber={tableNumber}
        />
        {hasMeta && (
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
            {isAppend && (
              <Badge
                variant="destructive"
                className="px-2.5 py-1 text-sm font-semibold"
              >
                {KDS_ORDER_TITLE_LABELS.append}
              </Badge>
            )}
            {isPriority && (
              <Badge
                variant="warning"
                className="px-2.5 py-1 text-sm font-semibold"
              >
                {KDS_ORDER_TITLE_LABELS.priority}
              </Badge>
            )}
          </div>
        )}
      </div>

      <AgeBadge elapsedMinutes={elapsedMinutes} isComplete={isComplete} />
    </CardHeader>
  );
}
