import type { ReactNode } from "react";
import {
  cn,
  getSurfacePanelClassName,
  getSurfaceStackClassName,
  getToneBadgeClassName,
  type UiDensity,
  type UiSurface,
  type UiTone,
} from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";

const TITLE_CLASSNAME: Record<UiDensity, string> = {
  compact: "text-xl font-bold tracking-tight md:text-2xl",
  comfortable: "text-2xl font-bold tracking-tight md:text-3xl",
  touch: "text-3xl font-bold tracking-tight md:text-4xl",
};

const DESCRIPTION_CLASSNAME: Record<UiDensity, string> = {
  compact: "max-w-3xl text-sm leading-6 text-muted-foreground",
  comfortable: "max-w-3xl text-sm leading-6 text-muted-foreground",
  touch: "max-w-3xl text-base leading-7 text-muted-foreground",
};

export function PageContainer({
  children,
  className,
  density = "comfortable",
}: {
  children: ReactNode;
  className?: string;
  density?: UiDensity;
}) {
  return (
    <section className={getSurfaceStackClassName(density, className)}>
      {children}
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  density = "comfortable",
  surface = "admin",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  density?: UiDensity;
  surface?: UiSurface;
}) {
  return (
    <header
      data-surface={surface}
      data-density={density}
      className={cn(
        "ui-page-header flex flex-wrap items-start justify-between gap-3",
        className,
      )}
    >
      <div className="space-y-2">
        {eyebrow ? <p className="app-section-label">{eyebrow}</p> : null}
        <h1 className={TITLE_CLASSNAME[density]}>{title}</h1>
        {description ? (
          <p className={DESCRIPTION_CLASSNAME[density]}>{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

export function FilterBar({
  children,
  className,
  surface = "admin",
}: {
  children: ReactNode;
  className?: string;
  surface?: UiSurface;
}) {
  return (
    <div
      data-surface={surface}
      className={getSurfacePanelClassName(
        surface,
        cn("flex flex-wrap items-end gap-3 rounded-2xl p-4 md:p-5", className),
      )}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  surface = "admin",
  density = "comfortable",
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  surface?: UiSurface;
  density?: UiDensity;
}) {
  return (
    <div
      data-surface={surface}
      data-density={density}
      className={getSurfacePanelClassName(
        surface,
        cn(
          "flex min-h-55 flex-col items-center justify-center gap-3 rounded-2xl px-6 text-center",
          className,
        ),
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
  surface = "admin",
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  status?: ReactNode;
  statusTone?: UiTone;
  steps?: Array<{
    label: string;
    description?: string;
    state: "todo" | "current" | "done";
  }>;
  actions?: ReactNode;
  className?: string;
  wrapperClassName?: string;
  surface?: UiSurface;
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 items-center justify-center p-4 md:p-6",
        wrapperClassName,
      )}
    >
      <section
        data-surface={surface}
        className={getSurfacePanelClassName(
          surface,
          cn("ui-flow-panel w-full max-w-4xl rounded-4xl p-5 md:p-6", className),
        )}
      >
        <div className="relative space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-3">
                {icon ? (
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/85 text-foreground shadow-sm">
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
                  className="ui-flow-step"
                  data-state={step.state}
                >
                  <div className="flex items-start gap-3">
                    <div className="ui-flow-stage-index">{index + 1}</div>
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

export function SectionCard({
  children,
  className,
  surface = "admin",
  density = "comfortable",
}: {
  children: ReactNode;
  className?: string;
  surface?: UiSurface;
  density?: UiDensity;
}) {
  return (
    <Card className={getSurfacePanelClassName(surface, className)}>
      <CardContent
        className={cn(
          density === "compact"
            ? "p-4 md:p-5"
            : density === "touch"
              ? "p-6 md:p-7"
              : "p-5 md:p-6",
        )}
      >
        {children}
      </CardContent>
    </Card>
  );
}

export function StatusBadge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: UiTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Badge
      variant="outline"
      className={getToneBadgeClassName(tone, className)}
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
