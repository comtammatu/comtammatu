import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
} from "@comtammatu/ui/components/card";

export type EmptyStateMode =
  | "full"
  | "inline"
  | "table-row"
  | "no-data"
  | "no-results"
  | "no-access"
  | "error";

export type SurfaceDensity =
  | "compact"
  | "default"
  | "comfortable"
  | "touch";

function resolveCardSize(density: SurfaceDensity | undefined): "default" | "sm" {
  return density === "compact" ? "sm" : "default";
}

/* ── PageContainer ── */

export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-5 lg:space-y-6", className)}>{children}</div>;
}

/* ── PageHeader ── */

export function PageHeader({
  title,
  description,
  eyebrow,
  children,
  actions,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Card className="app-panel">
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            {eyebrow ? <span className="app-kicker">{eyebrow}</span> : null}
            <div className="space-y-2">
              <h2 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {title}
              </h2>
              {description ? (
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
          {actions ?? children ? (
            <div className="flex flex-wrap items-center gap-2 self-start">
              {actions ?? children}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── SectionCard ── */

export function SectionCard({
  title,
  description,
  children,
  className,
  action,
  density = "default",
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
  density?: SurfaceDensity;
}) {
  return (
    <Card
      size={resolveCardSize(density)}
      data-density={density}
      className={cn("app-panel", className)}
    >
      {title ? (
        <div className="flex flex-col gap-4 border-b border-border/60 px-4 pb-4 sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:pb-5">
          <div className="space-y-1">
            <h3 className="font-heading text-xl font-semibold text-foreground">
              {title}
            </h3>
            {description ? (
              <p className="text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {action ? <div className="flex items-center gap-2">{action}</div> : null}
        </div>
      ) : null}
      <CardContent className="px-4 sm:px-5">{children}</CardContent>
    </Card>
  );
}

/* ── EmptyState ── */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  mode = "full",
  density = "default",
  children,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  mode?: EmptyStateMode;
  density?: SurfaceDensity;
  children?: ReactNode;
}) {
  return (
    <div
      data-mode={mode}
      data-density={density}
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="flex size-14 items-center justify-center rounded-full border border-border/70 bg-background/80 text-primary shadow-sm">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1.5">
        <h3 className="font-heading text-2xl font-semibold">{title}</h3>
        {description ? (
          <p className="max-w-md text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="flex flex-wrap justify-center gap-2">{action}</div>
      ) : null}
      {children}
    </div>
  );
}

/* ── EmptyStatePanel ── */

export function EmptyStatePanel({
  icon,
  title,
  description,
  action,
  className,
  mode,
  children,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  mode?: EmptyStateMode;
  children?: ReactNode;
}) {
  return (
    <Card className={cn("app-panel", className)}>
      <CardContent>
        <EmptyState
          icon={icon}
          title={title}
          description={description}
          action={action}
          mode={mode}
        />
        {children}
      </CardContent>
    </Card>
  );
}

/* ── StatusBadge ── */

const STATUS_TO_BADGE_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info"
> = {
  active: "success",
  success: "success",
  ready: "success",
  pending: "warning",
  warning: "warning",
  processing: "info",
  info: "info",
  error: "destructive",
  danger: "destructive",
  destructive: "destructive",
  cancelled: "secondary",
  inactive: "secondary",
  neutral: "secondary",
  default: "outline",
};

export function StatusBadge({
  variant,
  tone,
  children,
  className,
}: {
  variant?: string;
  tone?: string;
  children: ReactNode;
  className?: string;
}) {
  const key = variant ?? tone ?? "default";
  const badgeVariant = STATUS_TO_BADGE_VARIANT[key] ?? "outline";

  return (
    <Badge variant={badgeVariant} className={className}>
      {children}
    </Badge>
  );
}

/* ── FilterBar ── */

export function FilterBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "app-subpanel flex flex-wrap items-center gap-2 p-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ── ActionIconButton ── */

export function ActionIconButton({
  icon,
  label,
  onClick,
  className,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      className={className}
      aria-label={label}
    >
      {icon}
    </Button>
  );
}
