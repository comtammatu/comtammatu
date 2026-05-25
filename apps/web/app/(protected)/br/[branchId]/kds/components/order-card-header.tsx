"use client";

import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { CardHeader } from "@comtammatu/ui/components/card";
import { AgeBadge } from "./age-badge";
import { OrderNote } from "./order-note";
import { OrderTitleLine } from "./order-title-line";

const KDS_ORDER_TITLE_LABELS = {
  priority: "Ưu tiên",
} as const;

interface OrderCardHeaderProps {
  orderNumber: string;
  kitchenTicketNumber: string;
  orderType: string;
  tableNumber: number | null;
  sendKind: string | null;
  contextLabel?: string;
  elapsedMinutes: number;
  isComplete: boolean;
  isPriority: boolean;
  orderNote: string | null;
  bgClass: string;
}

export function OrderCardHeader({
  orderNumber,
  kitchenTicketNumber,
  orderType,
  tableNumber,
  sendKind,
  contextLabel,
  elapsedMinutes,
  isComplete,
  isPriority,
  orderNote,
  bgClass,
}: OrderCardHeaderProps) {
  const resolvedContextLabel =
    contextLabel ?? (sendKind === "append" ? "Gọi thêm" : undefined);
  const hasMeta = isPriority || !!orderNote?.trim();

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
          contextLabel={resolvedContextLabel}
        />
        {hasMeta && (
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
            {isPriority && (
              <Badge
                variant="warning"
                className="px-2.5 py-1 text-sm font-semibold"
              >
                {KDS_ORDER_TITLE_LABELS.priority}
              </Badge>
            )}
            <OrderNote note={orderNote} compact className="basis-full" />
          </div>
        )}
      </div>

      <AgeBadge elapsedMinutes={elapsedMinutes} isComplete={isComplete} />
    </CardHeader>
  );
}
