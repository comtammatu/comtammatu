"use client";

import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";

export type KpiRowProps = {
  children: ReactNode;
  className?: string;
  density?: "comfortable" | "compact";
};

export function KpiRow({
  children,
  className,
  density = "comfortable",
}: KpiRowProps) {
  const isCompact = density === "compact";
  return (
    <div
      className={cn(
        "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        isCompact ? "gap-2" : "gap-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
