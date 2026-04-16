import type { ReactNode } from "react";
import { Card, CardContent } from "@comtammatu/ui/components/card";

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
    <Card className={className}>
      <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        {icon ? (
          <div className="flex size-14 items-center justify-center rounded-full border bg-muted text-primary">
            {icon}
          </div>
        ) : null}
        <div className="space-y-1.5">
          <h3 className="text-2xl font-semibold">
            {title ?? "Chưa có dữ liệu"}
          </h3>
          {description ? (
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {children ? (
          <div className="flex flex-wrap justify-center gap-2">{children}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
