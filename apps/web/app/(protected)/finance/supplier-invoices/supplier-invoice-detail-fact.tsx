"use client";

import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";

export function DetailFact({
  label,
  value,
  className,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <Item variant="outline" size="sm" className={cn("items-start", className)}>
      <ItemContent className="gap-1">
        <ItemDescription className="line-clamp-none">{label}</ItemDescription>
        <ItemTitle
          size="heading"
          className={cn("line-clamp-none font-normal", valueClassName)}
        >
          {value}
        </ItemTitle>
      </ItemContent>
    </Item>
  );
}
