import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE_CLASSNAMES: Record<StatusTone, string> = {
  success: "bg-green-50 text-green-700 border-green-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  danger: "bg-red-50 text-red-700 border-red-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  neutral: "bg-muted text-muted-foreground border-border",
};

/** @deprecated surface/density props are ignored — kept for backward compat */
export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
  /** @deprecated ignored */
  density?: string;
}) {
  return (
    <section className={cn("space-y-5 p-5 md:space-y-6 md:p-6", className)}>
      {children}
    </section>
  );
}

/** @deprecated surface/density props are ignored — kept for backward compat */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  /** @deprecated ignored */
  density?: string;
  /** @deprecated ignored */
  surface?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-3",
        className,
      )}
    >
      <div className="space-y-2">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

/** @deprecated surface prop is ignored — kept for backward compat */
export function FilterBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
  /** @deprecated ignored */
  surface?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4 shadow-sm md:p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** @deprecated surface/density props are ignored — kept for backward compat */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** @deprecated ignored */
  surface?: string;
  /** @deprecated ignored */
  density?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-55 flex-col items-center justify-center gap-3 rounded-lg border bg-card px-6 text-center shadow-sm",
        className,
      )}
    >
      {icon ? <div className="text-muted-foreground/60">{icon}</div> : null}
      <div className="space-y-1">
        <p className="text-base font-semibold">{title}</p>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

const STEP_STATE_CLASSNAMES: Record<string, string> = {
  todo: "border-border bg-muted/50 text-muted-foreground",
  current: "border-primary bg-primary/10 text-primary",
  done: "border-green-200 bg-green-50 text-green-700",
};

const STEP_INDEX_CLASSNAMES: Record<string, string> = {
  todo: "border-border bg-background text-muted-foreground",
  current: "border-primary bg-primary text-primary-foreground",
  done: "border-green-200 bg-green-100 text-green-700",
};

/** @deprecated surface prop is ignored — kept for backward compat */
export function FlowStatePanel({
  title,
  description,
  icon,
  status,
  statusTone = "info",
  steps,
  actions,
  className,
  wrapperClassName,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  status?: ReactNode;
  statusTone?: StatusTone;
  steps?: Array<{
    label: string;
    description?: string;
    state: "todo" | "current" | "done";
  }>;
  actions?: ReactNode;
  className?: string;
  wrapperClassName?: string;
  /** @deprecated ignored */
  surface?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 items-center justify-center p-4 md:p-6",
        wrapperClassName,
      )}
    >
      <section
        className={cn(
          "w-full max-w-4xl rounded-lg border bg-card p-5 shadow-sm md:p-6",
          className,
        )}
      >
        <div className="relative space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-3">
                {icon ? (
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-background text-foreground shadow-sm">
                    {icon}
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                    {title}
                  </h2>
                  {description ? (
                    <p className="max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
                      {description}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
            {status ? (
              <StatusBadge
                tone={statusTone}
                className="min-h-9 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm"
              >
                {status}
              </StatusBadge>
            ) : null}
          </div>

          {steps?.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {steps.map((step, index) => (
                <div
                  key={`${step.label}-${index}`}
                  className={cn(
                    "rounded-lg border p-3",
                    STEP_STATE_CLASSNAMES[step.state],
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                        STEP_INDEX_CLASSNAMES[step.state],
                      )}
                    >
                      {index + 1}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{step.label}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {actions ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

/** @deprecated surface/density props are ignored — kept for backward compat */
export function SectionCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
  /** @deprecated ignored */
  surface?: string;
  /** @deprecated ignored */
  density?: string;
}) {
  return (
    <Card className={cn("rounded-lg border bg-card shadow-sm", className)}>
      <CardContent className="p-5 md:p-6">{children}</CardContent>
    </Card>
  );
}

export function StatusBadge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: StatusTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(TONE_CLASSNAMES[tone], className)}
    >
      {children}
    </Badge>
  );
}

export function ActionIconButton({
  icon,
  label,
  onClick,
  className,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "touch-target-lg focus-ring-standard rounded-xl",
        className,
      )}
      aria-label={label}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </Button>
  );
}
