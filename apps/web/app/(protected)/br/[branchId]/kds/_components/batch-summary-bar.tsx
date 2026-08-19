"use client";

import { useMemo, useState } from "react";
import { formatCount } from "@comtammatu/shared/format";
import { KDS_VI } from "@comtammatu/shared/messages";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import {
  ChevronDown as IconChevronDown,
  ChevronUp as IconChevronUp,
  Layers as IconLayers,
} from "lucide-react";
import { aggregateKdsBatchSummary } from "../_lib/batch-summary";
import { KDS_ITEM_NAME_CLASS } from "../_lib/status-config";
import type { KdsOrder } from "../types";

interface BatchSummaryBarProps {
  orders: KdsOrder[];
  className?: string;
}

export function BatchSummaryBar({ orders, className }: BatchSummaryBarProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const aggregatedItems = useMemo(
    () => aggregateKdsBatchSummary(orders),
    [orders],
  );

  if (aggregatedItems.length === 0) return null;

  const totalPortions = aggregatedItems.reduce(
    (sum, item) => sum + item.totalQuantity,
    0,
  );

  return (
    <div
      data-testid="kds-batch-summary"
      className={cn(
        "flex min-w-0 flex-col gap-2 border-b border-border/50 bg-muted/30 px-2 py-2 xl:px-3",
        className,
      )}
      aria-label={KDS_VI.batchSummaryAria}
    >
      <div className="flex min-w-0 items-center gap-2">
        <IconLayers className="size-5 shrink-0 text-primary" aria-hidden />
        <span className="font-heading text-base font-semibold text-foreground">
          {KDS_VI.batchSummary}
        </span>
        <span className="font-mono text-xl font-semibold leading-none tabular-nums text-foreground xl:text-2xl">
          {formatCount(totalPortions)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          className="ml-auto shrink-0"
          aria-expanded={isExpanded}
          aria-label={
            isExpanded
              ? KDS_VI.batchSummaryCollapse
              : KDS_VI.batchSummaryExpand
          }
          onClick={() => setIsExpanded((open) => !open)}
        >
          {isExpanded ? (
            <IconChevronUp aria-hidden />
          ) : (
            <IconChevronDown aria-hidden />
          )}
        </Button>
      </div>

      {isExpanded ? (
        <ul className="flex list-none flex-wrap gap-2 p-0">
          {aggregatedItems.map((item) => (
            <li
              key={item.itemName}
              className="flex min-h-14 min-w-24 flex-col items-center justify-center gap-1 rounded-md bg-card px-3 py-2 ring-1 ring-inset ring-border"
            >
              <span className="font-mono text-xl font-semibold leading-none tabular-nums text-foreground xl:text-2xl">
                {formatCount(item.totalQuantity)}
              </span>
              <span
                className={cn(
                  "max-w-44 text-center break-words text-foreground",
                  KDS_ITEM_NAME_CLASS,
                )}
              >
                {item.itemName}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
