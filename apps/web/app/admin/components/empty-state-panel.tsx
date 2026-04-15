import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";

interface EmptyStatePanelProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function EmptyStatePanel({
  title,
  description,
  icon,
  className,
  children,
}: EmptyStatePanelProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/70 bg-background/84 px-5 py-12 text-center shadow-sm",
        className,
      )}
    >
      {icon ? (
        <div className="flex size-12 items-center justify-center rounded-2xl border border-border/70 bg-muted/40 text-muted-foreground shadow-sm">
          {icon}
        </div>
      ) : null}
      <h3 className="mt-3 text-base font-semibold tracking-tight text-foreground">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      ) : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
