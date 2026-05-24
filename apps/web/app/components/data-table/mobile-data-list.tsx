"use client";

import type { ReactNode } from "react";
import { InteractiveCard } from "./interactive-card";
import { STATES_VI } from "@comtammatu/shared/messages";

interface MobileDataListProps<T> {
  data: T[];
  getRowKey: (row: T) => string | number;
  renderCard: (row: T) => ReactNode;
}

export function MobileDataList<T>({
  data,
  getRowKey,
  renderCard,
}: MobileDataListProps<T>) {
  if (data.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        {STATES_VI.empty}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {data.map((row) => (
        <InteractiveCard
          key={getRowKey(row)}
          minHeight="mobile"
          padding="default"
        >
          {renderCard(row)}
        </InteractiveCard>
      ))}
    </div>
  );
}
