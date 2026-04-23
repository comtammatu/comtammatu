import type { ReactNode } from "react";
import type { Icon } from "@tabler/icons-react";
import { IconCircleCheck } from "@tabler/icons-react";
import { cn } from "@comtammatu/ui";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";

interface InventoryPageContentProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  width?: "wide" | "narrow";
}

export function InventoryPageContent({
  children,
  className,
  contentClassName,
  width = "wide",
}: InventoryPageContentProps) {
  return (
    <div className={cn("flex-1 overflow-auto p-4", className)}>
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

interface InventoryEmptyStateProps {
  title: string;
  description?: string;
  icon?: Icon;
  className?: string;
}

export function InventoryEmptyState({
  title,
  description,
  icon: Icon = IconCircleCheck,
  className,
}: InventoryEmptyStateProps) {
  return (
    <Empty className={cn("border border-dashed bg-muted/30 py-10", className)}>
      <EmptyMedia variant="icon">
        <Icon />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
    </Empty>
  );
}
