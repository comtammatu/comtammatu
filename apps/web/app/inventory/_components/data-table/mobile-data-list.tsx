"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { InteractiveCard } from "../interactive-card";

interface MobileDataListProps<T> {
  data: T[];
  getRowKey: (row: T) => string | number;
  renderCard: (row: T) => ReactNode;
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function MobileDataList<T>({
  data,
  getRowKey,
  renderCard,
}: MobileDataListProps<T>) {
  if (data.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Chưa có dữ liệu
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
