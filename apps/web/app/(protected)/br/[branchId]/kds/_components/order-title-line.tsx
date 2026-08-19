"use client";

import { TABLE_VI } from "@comtammatu/shared/messages";
import { cn } from "@comtammatu/ui";
import {
  formatKdsTicketSequenceDisplay,
  getOrderTypeLabel,
} from "../_lib/status-config";

interface OrderTitleLineProps {
  kitchenTicketNumber: string;
  orderNumber: string;
  orderType: string;
  tableNumber: number | null;
  size?: "default" | "compact";
  className?: string;
}

const TITLE_SIZE_CLASSES = {
  default: {
    target: "text-2xl",
    sequence: "text-base md:text-lg",
  },
  compact: {
    target: "text-xl xl:text-2xl",
    sequence: "text-xs md:text-sm xl:text-base",
  },
} as const;

function formatTableNumber(tableNumber: number): string {
  return tableNumber < 100
    ? String(tableNumber).padStart(2, "0")
    : String(tableNumber);
}

function getCallTarget(orderType: string, tableNumber: number | null): string {
  if (orderType === "dine_in" && tableNumber !== null) {
    return `${TABLE_VI.long} ${formatTableNumber(tableNumber)}`;
  }
  return getOrderTypeLabel(orderType);
}

export function OrderTitleLine({
  kitchenTicketNumber,
  orderNumber,
  orderType,
  tableNumber,
  size = "default",
  className,
}: OrderTitleLineProps) {
  const sequenceDisplay = formatKdsTicketSequenceDisplay(
    kitchenTicketNumber,
    orderNumber,
  );
  const callTarget = getCallTarget(orderType, tableNumber);
  const accessibleLabel = `${callTarget} ${sequenceDisplay}`;
  const sizeClass = TITLE_SIZE_CLASSES[size];

  return (
    <div
      aria-label={accessibleLabel}
      className={cn(
        "inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1.5 gap-y-1",
        className,
      )}
    >
      <span
        className={cn(
          "shrink-0 font-heading font-semibold uppercase leading-tight text-foreground",
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
