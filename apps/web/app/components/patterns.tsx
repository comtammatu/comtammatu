import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
  return <Card className={className}>{children}</Card>;
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
    <CardHeader>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <CardTitle className="text-2xl sm:text-3xl">{title}</CardTitle>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </div>
        {actions ?? children ? (
          <div className="flex flex-wrap items-center gap-2">
            {actions ?? children}
          </div>
        ) : null}
      </div>
    </CardHeader>
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
      className={className}
    >
      {title ? (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
          {action ? <CardAction>{action}</CardAction> : null}
        </CardHeader>
      ) : null}
      <CardContent>{children}</CardContent>
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
        <div className="flex size-12 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1.5">
        <h3 className="text-lg font-semibold">{title}</h3>
        {description ? (
          <p className="max-w-md text-sm text-muted-foreground">
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
    <Card className={className}>
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
        "flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/50 p-3",
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
