"use client";

import { useMemo } from "react";
import { formatCount } from "@comtammatu/shared/format";
import { KDS_VI } from "@comtammatu/shared/messages";
import { cn } from "@comtammatu/ui";
import { aggregateKdsBatchSummary } from "../_lib/batch-summary";
import { KDS_ITEM_NAME_CLASS } from "../_lib/status-config";
import type { KdsOrder } from "../types";

interface BatchSummaryBarProps {
  orders: KdsOrder[];
  className?: string;
}

export function BatchSummaryBar({ orders, className }: BatchSummaryBarProps) {
  const aggregatedItems = useMemo(
    () => aggregateKdsBatchSummary(orders),
    [orders],
  );

  if (aggregatedItems.length === 0) return null;

  return (
    <div
      data-testid="kds-batch-summary"
      className={cn(
        "flex min-w-0 border-b border-border/50 bg-muted/30 px-2 py-1.5 xl:px-3",
        className,
      )}
      aria-label={KDS_VI.batchSummaryAria}
    >
      <ul className="flex list-none flex-wrap gap-1.5 p-0">
        {aggregatedItems.map((item) => (
          <li
            key={item.itemName}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-card px-2.5 py-1 ring-1 ring-inset ring-border"
          >
            <span className="font-mono text-xl font-semibold leading-none tabular-nums text-foreground xl:text-2xl">
              {formatCount(item.totalQuantity)}
            </span>
            <span className={cn("text-foreground", KDS_ITEM_NAME_CLASS)}>
              {item.itemName}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
