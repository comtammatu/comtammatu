import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";

const STEP_STATE_STYLES = {
  done: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-100",
  current: "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-100",
  todo: "border-border bg-secondary/70 text-secondary-foreground dark:bg-secondary dark:text-secondary-foreground",
} as const;

const STATUS_STYLES = {
  neutral: "border-border bg-secondary/70 text-secondary-foreground",
  info: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-100",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-100",
  danger:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-100",
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
  surface,
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
  const darkSurface = surface === "dark";
  const statusClass =
    STATUS_STYLES[statusTone as keyof typeof STATUS_STYLES] ??
    STATUS_STYLES.neutral;

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-4xl border p-6 shadow-app-md sm:p-8",
        darkSurface
          ? "border-white/10 bg-zinc-950 text-zinc-50"
          : "surface-panel-strong paper-grid text-foreground",
        className,
      )}
    >
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-px",
          darkSurface ? "bg-white/10" : "bg-primary/15",
        )}
      />
      <div className="relative flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-4">
            {icon ? (
              <div
                className={cn(
                  "flex size-16 items-center justify-center rounded-full border",
                  darkSurface
                    ? "border-white/12 bg-white/6 text-orange-300"
                    : "border-border bg-secondary/80 text-primary",
                )}
              >
                {icon}
              </div>
            ) : null}
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
              {description ? (
                <p
                  className={cn(
                    "max-w-2xl text-sm leading-6 sm:text-base",
                    darkSurface ? "text-zinc-300" : "text-muted-foreground",
                  )}
                >
                  {description}
                </p>
              ) : null}
            </div>
          </div>
          {status ? (
            <div
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
                statusClass,
              )}
            >
              {status}
            </div>
          ) : null}
        </div>

        {steps?.length ? (
          <ol className="grid gap-3 lg:grid-cols-3">
            {steps.map((step, index) => (
              <li
                key={`${step.label}-${index}`}
                className={cn(
                  "rounded-3xl border p-4 text-left",
                  STEP_STATE_STYLES[
                    step.state as keyof typeof STEP_STATE_STYLES
                  ] ?? STEP_STATE_STYLES.todo,
                )}
              >
                <p className="text-xs font-semibold uppercase tracking-widest opacity-80">
                  Bước {index + 1}
                </p>
                <h3 className="mt-2 text-lg font-semibold">{step.label}</h3>
                <p className="mt-1 text-sm leading-6 opacity-80">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        ) : null}

        {action ? <div className="flex flex-wrap gap-3">{action}</div> : null}
      </div>
    </section>
  );
}
