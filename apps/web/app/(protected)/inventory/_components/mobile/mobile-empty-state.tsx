import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { cn } from "@comtammatu/ui";

interface MobileEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function MobileEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: MobileEmptyStateProps) {
  return (
    <Empty
      className={cn("border border-dashed bg-muted/30 px-4 py-10", className)}
    >
      <EmptyMedia variant="icon" className="size-12 rounded-full bg-background">
        <Icon className="size-6" />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle className="text-sm font-semibold">{title}</EmptyTitle>
        {description ? (
          <EmptyDescription className="text-xs">{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
