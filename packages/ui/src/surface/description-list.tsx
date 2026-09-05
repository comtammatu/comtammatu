"use client";

import type { ReactNode } from "react";
import { cn } from "../lib/utils";

export type DescriptionListItem = {
  term: ReactNode;
  description: ReactNode;
};

export type DescriptionListProps = {
  items: DescriptionListItem[];
  className?: string;
  termClassName?: string;
  descriptionClassName?: string;
};

export function DescriptionList({
  items,
  className,
  termClassName,
  descriptionClassName,
}: DescriptionListProps) {
  return (
    <dl className={cn("flex flex-col gap-3", className)}>
      {items.map((item, index) => (
        <div key={index} className="flex flex-col gap-1">
          <dt
            className={cn(
              "text-xs font-medium uppercase tracking-wide text-muted-foreground",
              termClassName,
            )}
          >
            {item.term}
          </dt>
          <dd className={cn("text-sm leading-6", descriptionClassName)}>
            {item.description}
          </dd>
        </div>
      ))}
    </dl>
  );
}
