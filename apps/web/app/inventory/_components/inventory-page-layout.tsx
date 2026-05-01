import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import { Card, CardContent } from "@comtammatu/ui/components/card";

interface InventoryPageContentProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  scroll?: boolean;
  width?: "wide" | "narrow";
}

export function InventoryPageContent({
  children,
  className,
  contentClassName,
  scroll = true,
  width = "wide",
}: InventoryPageContentProps) {
  return (
    <div
      className={cn(
        "no-scrollbar min-h-0 flex-1 p-4",
        scroll ? "overflow-auto" : "overflow-visible",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full flex-col gap-4",
          width === "narrow" ? "max-w-xl" : "max-w-7xl",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

interface InventoryFilterBarProps {
  children: ReactNode;
  className?: string;
}

export function InventoryFilterBar({
  children,
  className,
}: InventoryFilterBarProps) {
  return (
    <Card className="py-0">
      <CardContent
        className={cn("flex flex-wrap items-center gap-3 p-3", className)}
      >
        {children}
      </CardContent>
    </Card>
  );
}
