"use client";

import { TABLE_VI } from "@comtammatu/shared/messages";
import { cn } from "@comtammatu/ui";
import {
  formatKdsTicketSequenceDisplay,
  getOrderTypeLabel,
} from "../lib/status-config";

interface OrderTitleLineProps {
  kitchenTicketNumber: string;
  orderNumber: string;
  orderType: string;
  tableNumber: number | null;
  labelOverride?: string;
  size?: "default" | "compact";
  className?: string;
}

const TITLE_SIZE_CLASSES = {
  default: {
    target: "text-2xl",
    sequence: "text-base md:text-lg",
  },
  compact: {
    target: "text-base",
    sequence: "text-base",
  },
} as const;

function getCallTarget(orderType: string, tableNumber: number | null): string {
  if (orderType === "dine_in" && tableNumber !== null) {
    return `${TABLE_VI.long} ${String(tableNumber)}`;
  }
  return getOrderTypeLabel(orderType);
}

export function OrderTitleLine({
  kitchenTicketNumber,
  orderNumber,
  orderType,
  tableNumber,
  labelOverride,
  size = "default",
  className,
}: OrderTitleLineProps) {
  const sequenceDisplay = formatKdsTicketSequenceDisplay(
    kitchenTicketNumber,
    orderNumber,
  );
  const callTarget = labelOverride ?? getCallTarget(orderType, tableNumber);
  const sizeClass = TITLE_SIZE_CLASSES[size];

  return (
    <div
      aria-label={`${callTarget} ${sequenceDisplay}`}
      className={cn(
        "inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-x-2 gap-y-1",
        className,
      )}
    >
      <span
        className={cn(
          "shrink-0 font-heading font-semibold leading-tight text-foreground",
          sizeClass.target,
        )}
      >
        {callTarget}
      </span>
      <span
        className={cn(
          "shrink-0 font-mono font-semibold leading-tight text-muted-foreground tabular-nums",
          sizeClass.sequence,
        )}
      >
        {sequenceDisplay}
      </span>
    </div>
  );
}
