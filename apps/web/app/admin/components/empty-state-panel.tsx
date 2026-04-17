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

type EmptyStateMode =
  | "full"
  | "inline"
  | "table-row"
  | "no-data"
  | "no-results"
  | "no-access"
  | "error";

interface EmptyStatePanelProps {
  title?: string;
  mode?: EmptyStateMode;
  description?: string;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function EmptyStatePanel({
  title,
  mode: _mode = "no-data",
  description,
  icon,
  className,
  children,
}: EmptyStatePanelProps) {
  return (
    <Empty className={cn("border bg-card py-12", className)}>
      {icon ? <EmptyMedia variant="icon">{icon}</EmptyMedia> : null}
      <EmptyHeader>
        <EmptyTitle className="text-2xl font-semibold">
          {title ?? "Chưa có dữ liệu"}
        </EmptyTitle>
        {description ? (
          <EmptyDescription className="max-w-md text-sm leading-6">
            {description}
          </EmptyDescription>
        ) : null}
      </EmptyHeader>
      {children ? (
        <EmptyContent className="flex-row flex-wrap justify-center gap-2">
          {children}
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
