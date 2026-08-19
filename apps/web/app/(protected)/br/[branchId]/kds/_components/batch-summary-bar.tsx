"use client";

import { useMemo, useState } from "react";
import { formatCount } from "@comtammatu/shared/format";
import { KDS_VI } from "@comtammatu/shared/messages";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  ChevronDown as IconChevronDown,
  ChevronUp as IconChevronUp,
  Layers as IconLayers,
} from "lucide-react";
import { isKdsActiveTicketStatus } from "../_lib/order-status";
import type { KdsOrder } from "../types";

interface BatchSummaryBarProps {
  orders: KdsOrder[];
  className?: string;
}

interface AggregatedItem {
  itemName: string;
  totalQuantity: number;
}

export function BatchSummaryBar({ orders, className }: BatchSummaryBarProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const aggregatedItems = useMemo<AggregatedItem[]>(() => {
    const itemMap = new Map<string, number>();

    for (const order of orders) {
      const activeTicketItemIds = new Set(
        order.tickets
          .filter((t) => isKdsActiveTicketStatus(t.status))
          .map((t) => t.order_item_id),
      );

      for (const item of order.items) {
        if (activeTicketItemIds.has(item.id)) {
          const key = item.item_name;
          const current = itemMap.get(key) ?? 0;
          itemMap.set(key, current + (item.quantity ?? 1));
        }
      }
    }

    const list: AggregatedItem[] = [];
    for (const [itemName, totalQuantity] of itemMap) {
      list.push({ itemName, totalQuantity });
    }

    list.sort((a, b) => b.totalQuantity - a.totalQuantity);
    return list;
  }, [orders]);

  if (aggregatedItems.length === 0) return null;

  const totalPortions = aggregatedItems.reduce(
    (sum, item) => sum + item.totalQuantity,
    0,
  );

  return (
    <div
      className={cn(
        "flex h-9 items-center border-b border-border/50 bg-muted/30 px-2 xl:px-3",
        className,
      )}
      aria-label={KDS_VI.batchSummaryAria}
    >
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 gap-1.5 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          aria-label={
            isExpanded
              ? KDS_VI.batchSummaryCollapse
              : KDS_VI.batchSummaryExpand
          }
        >
          <IconLayers className="size-3.5 text-primary" aria-hidden />
          <span className="font-heading font-semibold text-foreground">{KDS_VI.batchSummary}</span>
          <span className="font-mono text-xs font-semibold tabular-nums text-primary">
            ({formatCount(totalPortions)})
          </span>
          {isExpanded ? (
            <IconChevronUp className="size-3 text-muted-foreground" aria-hidden />
          ) : (
            <IconChevronDown className="size-3 text-muted-foreground" aria-hidden />
          )}
        </Button>

        {isExpanded && (
          <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
            {aggregatedItems.map((item) => (
              <Badge
                key={item.itemName}
                variant="outline"
                className="shrink-0 gap-1.5 border-border/70 bg-card px-2 py-0.5 text-xs"
              >
                <span className="font-medium text-foreground">
                  {item.itemName}
                </span>
                <span className="inline-flex min-w-5 items-center justify-center rounded bg-primary/10 px-1 py-0.5 font-mono text-xs font-semibold tabular-nums text-primary">
                  {formatCount(item.totalQuantity)}
                </span>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
