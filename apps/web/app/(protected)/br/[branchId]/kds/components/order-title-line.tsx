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
  contextLabel?: string;
  size?: "default" | "compact";
  className?: string;
}

const TITLE_SIZE_CLASSES = {
  default: {
    context: "text-xs md:text-sm",
    target: "text-2xl",
    sequence: "text-base md:text-lg",
  },
  compact: {
    context: "text-xs",
    target: "text-lg",
    sequence: "text-sm md:text-base",
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
  contextLabel,
  size = "default",
  className,
}: OrderTitleLineProps) {
  const sequenceDisplay = formatKdsTicketSequenceDisplay(
    kitchenTicketNumber,
    orderNumber,
  );
  const callTarget = getCallTarget(orderType, tableNumber);
  const accessibleLabel = contextLabel
    ? `${contextLabel} ${callTarget} ${sequenceDisplay}`
    : `${callTarget} ${sequenceDisplay}`;
  const sizeClass = TITLE_SIZE_CLASSES[size];

  return (
    <div
      aria-label={accessibleLabel}
      className={cn(
        "inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1.5 gap-y-1",
        className,
      )}
    >
      {contextLabel && (
        <span
          className={cn(
            "shrink-0 rounded-md bg-muted px-1.5 py-1 font-semibold leading-none text-muted-foreground",
            sizeClass.context,
          )}
        >
          {contextLabel}
        </span>
      )}
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
