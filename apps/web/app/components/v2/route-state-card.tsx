"use client";

import type { ReactNode } from "react";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { cn } from "@comtammatu/ui";

const ROUTE_TONE_BADGE: Record<
  "info" | "warning" | "danger",
  "info" | "warning" | "destructive"
> = {
  info: "info",
  warning: "warning",
  danger: "destructive",
};

const STEP_STATE_CLASSNAME: Record<
  "todo" | "current" | "done",
  { card: string; index: string }
> = {
  todo: {
    card: "border-border bg-card text-muted-foreground",
    index: "border-border text-muted-foreground",
  },
  current: {
    card: "border-primary/40 bg-primary/8 text-foreground",
    index: "border-primary bg-primary text-primary-foreground",
  },
  done: {
    card: "border-success/35 bg-success/8 text-foreground",
    index: "border-success bg-success text-white",
  },
};

export function RouteStateCard({
  title,
  description,
  icon,
  status,
  statusTone,
  steps,
  surface = "default",
}: {
  title: string;
  description: string;
  icon: ReactNode;
  status: ReactNode;
  statusTone: "info" | "warning" | "danger";
  steps: Array<{
    label: string;
    description: string;
    state: "todo" | "current" | "done";
  }>;
  surface?: "default" | "dark";
}) {
  const dark = surface === "dark";

  return (
    <Card
      className={cn(
        "overflow-hidden rounded-3xl border shadow-sm",
        dark
          ? "border-white/10 bg-zinc-950 text-white"
          : "border-border/80 bg-card text-card-foreground",
      )}
    >
      <CardHeader className="gap-4 border-b border-current/10 p-6">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-2xl border",
              dark
                ? "border-white/10 bg-white/5 text-white"
                : "border-border bg-panel-subtle text-foreground",
            )}
          >
            {icon}
          </div>
          <div className="min-w-0 space-y-1.5">
            <p
              className={cn(
                "text-xs font-semibold uppercase tracking-widest",
                dark ? "text-zinc-400" : "text-muted-foreground",
              )}
            >
              Tình trạng bề mặt
            </p>
            <CardTitle
              className={cn("text-2xl leading-tight", dark && "text-white")}
            >
              {title}
            </CardTitle>
            <p
              className={cn(
                "max-w-2xl text-sm leading-6",
                dark ? "text-zinc-300" : "text-muted-foreground",
              )}
            >
              {description}
            </p>
          </div>
        </div>
        <Badge
          variant={ROUTE_TONE_BADGE[statusTone]}
          className="inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold"
        >
          <span className="inline-flex items-center gap-1.5">{status}</span>
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-3 p-6 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => {
          const palette = STEP_STATE_CLASSNAME[step.state];
          return (
            <div
              key={`${step.label}-${index}`}
              className={cn(
                "rounded-2xl border p-4 transition-transform hover:-translate-y-0.5",
                palette.card,
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                    palette.index,
                  )}
                >
                  {index + 1}
                </div>
                <div className="min-w-0 space-y-1">
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      dark && "text-white",
                    )}
                  >
                    {step.label}
                  </p>
                  <p
                    className={cn(
                      "text-xs leading-5",
                      dark ? "text-zinc-400" : "text-muted-foreground",
                    )}
                  >
                    {step.description}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
