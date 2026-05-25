"use client";

import { TABLE_VI } from "@comtammatu/shared/messages";
import { cn } from "@comtammatu/ui";
import {
  formatKitchenTicketDisplay,
  getOrderTypeLabel,
} from "../lib/status-config";

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
    ticket: "text-2xl",
    target: "text-base md:text-lg",
    invoice: "text-sm",
  },
  compact: {
    ticket: "text-xl",
    target: "text-sm",
    invoice: "text-xs",
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
  size = "default",
  className,
}: OrderTitleLineProps) {
  const ticketDisplay = formatKitchenTicketDisplay(kitchenTicketNumber);
  const callTarget = getCallTarget(orderType, tableNumber).toLocaleUpperCase(
    "vi-VN",
  );
  const sizeClass = TITLE_SIZE_CLASSES[size];

  return (
    <div
      aria-label={`${kitchenTicketNumber} ${callTarget} ${orderNumber}`}
      className={cn(
        "inline-flex min-w-0 max-w-full items-baseline gap-2 overflow-hidden whitespace-nowrap",
        className,
      )}
    >
      <span
        className={cn(
          "shrink-0 font-mono font-semibold leading-none tabular-nums",
          sizeClass.ticket,
        )}
      >
        {ticketDisplay}
      </span>
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
          "min-w-0 truncate font-mono font-medium leading-tight text-muted-foreground tabular-nums",
          sizeClass.invoice,
        )}
      >
        {orderNumber}
      </span>
    </div>
  );
}
