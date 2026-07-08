"use client";

import { useState } from "react";
import { ChevronDown as IconChevronDown, ChevronUp as IconChevronUp } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@comtammatu/ui/components/item";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import type { SelfOrderOrderLine } from "@lib/self-order/contracts";

const COLLAPSE_THRESHOLD = 5;

interface OrderSummaryProps {
  items: SelfOrderOrderLine[];
}

export function OrderSummary({ items }: OrderSummaryProps) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  const visible = expanded ? items : items.slice(0, COLLAPSE_THRESHOLD);
  const hasMore = items.length > COLLAPSE_THRESHOLD;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-sm font-semibold">
          {SELF_ORDER_VI.orderedItemsTitle}
        </h2>
        <Badge variant="outline">{items.length}</Badge>
      </div>
      <Item variant="outline" className="flex-col gap-1 p-2">
        {visible.map((item, index) => (
          <ItemContent key={`${item.menuItemId}:${index}`} className="flex-row items-center justify-between gap-3">
            <ItemTitle className="min-w-0 truncate text-sm font-normal">
              {item.variantName ? `${item.itemName} ${item.variantName}` : item.itemName}
              <span className="ml-1 text-muted-foreground">x{item.quantity}</span>
            </ItemTitle>
            <ItemDescription className="shrink-0 tabular-nums">
              {formatVND(item.lineTotal)}
            </ItemDescription>
          </ItemContent>
        ))}
        {hasMore ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? <IconChevronUp data-icon="inline-start" /> : <IconChevronDown data-icon="inline-start" />}
            {SELF_ORDER_VI.orderedItemsShowMore}
          </Button>
        ) : null}
      </Item>
    </section>
  );
}
