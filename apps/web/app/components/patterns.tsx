import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";

export type EmptyStateMode =
  | "full"
  | "inline"
  | "table-row"
  | "no-data"
  | "no-results"
  | "no-access"
  | "error";

const SECTION_DENSITY = {
  compact: "gap-4 p-4 sm:p-5",
  default: "gap-5 p-5 sm:p-6",
  comfortable: "gap-6 p-6 sm:p-7",
} as const;

const STATUS_VARIANTS: Record<string, string> = {
  active:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-100",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-100",
  ready:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-100",
  pending:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-100",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-100",
  processing:
    "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-100",
  info: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-100",
  error:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-100",
  danger:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-100",
  destructive:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-100",
  cancelled:
    "border-border bg-secondary/70 text-secondary-foreground dark:bg-secondary dark:text-secondary-foreground",
  inactive:
    "border-border bg-secondary/70 text-secondary-foreground dark:bg-secondary dark:text-secondary-foreground",
  neutral:
    "border-border bg-secondary/70 text-secondary-foreground dark:bg-secondary dark:text-secondary-foreground",
  default:
    "border-border bg-secondary/70 text-secondary-foreground dark:bg-secondary dark:text-secondary-foreground",
};

export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "surface-panel paper-grid relative overflow-hidden px-5 py-5 sm:px-6 sm:py-6",
        className,
      )}
    >
      {children}
    </section>
  );
}

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
    <div className="flex flex-col gap-4 border-b border-border/70 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl space-y-2">
        {eyebrow ? <p className="ops-kicker">{eyebrow}</p> : null}
        <div className="space-y-2">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {title}
          </h2>
          {description ? (
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ?? children ? (
        <div className="flex flex-wrap items-center gap-2">
          {actions ?? children}
        </div>
      ) : null}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  children,
  className,
  action,
  density,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
  density?: string;
}) {
  const densityClass =
    SECTION_DENSITY[density as keyof typeof SECTION_DENSITY] ??
    SECTION_DENSITY.default;

  return (
    <section
      className={cn(
        "surface-panel-strong relative overflow-hidden",
        className,
      )}
    >
      {title ? (
        <div className="flex flex-col gap-4 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="space-y-1">
            <h3 className="text-xl font-semibold text-foreground">{title}</h3>
            {description ? (
              <p className="text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn("flex flex-col", densityClass)}>{children}</div>
    </section>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  mode: _mode,
  density: _density,
  children,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  mode?: EmptyStateMode;
  density?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 px-5 py-12 text-center sm:px-8 sm:py-14",
        className,
      )}
    >
      {icon ? (
        <div className="flex size-16 items-center justify-center rounded-full border border-border bg-secondary/75 text-primary shadow-app-sm">
          {icon}
        </div>
      ) : null}
      <div className="space-y-2">
        <h3 className="text-2xl font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex flex-wrap justify-center gap-2">{action}</div> : null}
      {children}
    </div>
  );
}

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
    <div className={cn("surface-panel overflow-hidden", className)}>
      <EmptyState
        icon={icon}
        title={title}
        description={description}
        action={action}
        mode={mode}
      />
      {children}
    </div>
  );
}

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

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold",
        STATUS_VARIANTS[key] ?? STATUS_VARIANTS.default,
        className,
      )}
    >
      {children}
    </span>
  );
}

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
        "surface-muted flex flex-wrap items-center gap-2 p-3 sm:p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

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
  variant?: string;
  size?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      className={cn(
        "rounded-full border border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        className,
      )}
      aria-label={label}
    >
      {icon}
    </Button>
  );
}
