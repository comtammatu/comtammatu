import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Card, CardContent } from "@comtammatu/ui/components/card";

const STEP_BADGE_VARIANT = {
  done: "success",
  current: "warning",
  todo: "secondary",
} as const;

const STATUS_BADGE_VARIANT = {
  neutral: "secondary",
  info: "info",
  warning: "warning",
  danger: "destructive",
} as const;

export function RouteStateCard({
  title,
  description,
  icon,
  action,
  className,
  status,
  statusTone,
  steps,
  surface: _surface,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  status?: ReactNode;
  statusTone?: string;
  steps?: { label: string; description: string; state: string }[];
  surface?: string;
}) {
  const badgeVariant =
    STATUS_BADGE_VARIANT[statusTone as keyof typeof STATUS_BADGE_VARIANT] ??
    "secondary";

  return (
    <Card className={cn("app-panel", className)}>
      <CardContent className="p-6 sm:p-8">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-4">
              {icon ? (
                <div className="flex size-14 items-center justify-center rounded-full border border-border/70 bg-background/80 text-primary shadow-sm">
                  {icon}
                </div>
              ) : null}
              <div className="space-y-1.5">
                <h2 className="font-heading text-3xl font-semibold tracking-tight">
                  {title}
                </h2>
                {description ? (
                  <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                    {description}
                  </p>
                ) : null}
              </div>
            </div>
            {status ? (
              <Badge variant={badgeVariant}>{status}</Badge>
            ) : null}
          </div>

          {steps?.length ? (
            <ol className="grid gap-3 lg:grid-cols-3">
              {steps.map((step, index) => {
                const stepVariant =
                  STEP_BADGE_VARIANT[
                    step.state as keyof typeof STEP_BADGE_VARIANT
                  ] ?? "secondary";
                return (
                  <li key={`${step.label}-${index}`}>
                    <Card
                      className={cn(
                        "app-subpanel",
                        stepVariant === "success" &&
                          "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10",
                        stepVariant === "warning" &&
                          "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10",
                      )}
                    >
                      <CardContent className="p-4">
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                          Bước {index + 1}
                        </p>
                        <h3 className="mt-2 text-base font-semibold">
                          {step.label}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {step.description}
                        </p>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ol>
          ) : null}

          {action ? (
            <div className="flex flex-wrap gap-3">{action}</div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
