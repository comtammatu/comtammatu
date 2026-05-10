"use client";

import Link from "next/link";
import {
  ArrowRight as IconArrowRight,
  CheckCircle2 as IconCheckCircle,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { AppEmptyState } from "@/components/surface";
import { InteractiveCard } from "./interactive-card";

export type InventoryWorkflowTone =
  | "default"
  | "primary"
  | "success"
  | "warning"
  | "info"
  | "destructive";

const WORKFLOW_CARD_TONE: Record<InventoryWorkflowTone, string> = {
  default: "",
  primary: "border-primary/30 bg-primary/5",
  success: "border-success/30 bg-success/5",
  warning: "border-warning/40 bg-warning/5",
  info: "border-info/30 bg-info/5",
  destructive: "border-destructive/40 bg-destructive/5",
};

const WORKFLOW_ICON_TONE: Record<InventoryWorkflowTone, string> = {
  default: "text-muted-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  info: "text-info",
  destructive: "text-destructive",
};

const WORKFLOW_DOT_TONE: Record<InventoryWorkflowTone, string> = {
  default: "bg-muted-foreground",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  destructive: "bg-destructive",
};

export type InventoryWorkflowAction = {
  label: string;
  href: string;
  primary?: boolean;
  icon?: ReactNode;
};

export type InventoryWorkflowStep = {
  key: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  metric?: ReactNode;
  metricLabel?: string;
  statusLabel?: string;
  tone?: InventoryWorkflowTone;
  actions?: InventoryWorkflowAction[];
};

export type InventoryMetricItem = {
  key: string;
  label: string;
  value: ReactNode;
  tone?: Exclude<InventoryWorkflowTone, "primary">;
};

export type InventoryActionItem = {
  key: string;
  title: string;
  description?: string;
  href: string;
  icon?: ReactNode;
  tone?: InventoryWorkflowTone;
  badge?: ReactNode;
  badgeVariant?: BadgeProps["variant"];
  meta?: ReactNode;
};

type HrefResolver = (href: string) => string;

function defaultResolveHref(href: string): string {
  return href;
}

export function InventoryWorkflowMap({
  title,
  description,
  steps,
  resolveHref = defaultResolveHref,
}: {
  title?: string;
  description?: string;
  steps: InventoryWorkflowStep[];
  resolveHref?: HrefResolver;
}) {
  return (
    <section className="flex flex-col gap-3">
      {title || description ? (
        <div className="flex flex-col gap-1">
          {title ? (
            <h2 className="font-heading text-base font-semibold">{title}</h2>
          ) : null}
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-3">
        {steps.map((step) => {
          const Icon = step.icon;
          const tone = step.tone ?? "default";

          return (
            <Card
              key={step.key}
              size="sm"
              className={cn("min-w-0", WORKFLOW_CARD_TONE[tone])}
            >
              <CardHeader>
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={cn(
                      "inline-flex shrink-0 rounded-md border bg-background p-2",
                      WORKFLOW_ICON_TONE[tone],
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base leading-tight">
                      {step.title}
                    </CardTitle>
                    <CardDescription className="mt-1 line-clamp-3">
                      {step.description}
                    </CardDescription>
                  </div>
                  {step.metric != null ? (
                    <div className="shrink-0 text-right">
                      <div
                        className={cn(
                          "font-mono text-lg font-semibold tabular-nums sm:text-xl",
                          step.metric === "0"
                            ? "text-muted-foreground"
                            : WORKFLOW_ICON_TONE[tone],
                        )}
                      >
                        {step.metric}
                      </div>
                      {step.metricLabel ? (
                        <div className="text-xs text-muted-foreground">
                          {step.metricLabel}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="flex min-w-0 flex-col gap-3">
                {step.statusLabel ? (
                  <Button
                    asChild
                    size="touch"
                    variant="outline"
                    className="justify-between"
                  >
                    <Link href={resolveHref(step.href)}>
                      <span className="min-w-0 truncate">
                        {step.statusLabel}
                      </span>
                      <IconArrowRight className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </Button>
                ) : null}
                {step.actions && step.actions.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {step.actions.map((action) => (
                      <Button
                        key={`${step.key}-${action.label}`}
                        asChild
                        size={action.primary ? "touch" : "sm"}
                        variant={action.primary ? "default" : "outline"}
                        className="justify-between"
                      >
                        <Link href={resolveHref(action.href)}>
                          <span>{action.label}</span>
                          {action.icon ?? <IconArrowRight className="size-4" />}
                        </Link>
                      </Button>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

export function InventoryMetricStrip({
  items,
}: {
  items: InventoryMetricItem[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {items.map((item) => {
        const tone = item.tone ?? "default";
        return (
          <Card
            key={item.key}
            size="sm"
            className={cn(WORKFLOW_CARD_TONE[tone])}
          >
            <CardContent className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-xs text-muted-foreground">
                {item.label}
              </span>
              <span
                className={cn(
                  "font-mono text-lg font-semibold tabular-nums",
                  tone !== "default" && WORKFLOW_ICON_TONE[tone],
                )}
              >
                {item.value}
              </span>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function InventoryActionList({
  items,
  emptyTitle = "Không có việc cần xử lý",
  emptyDescription,
  resolveHref = defaultResolveHref,
}: {
  items: InventoryActionItem[];
  emptyTitle?: string;
  emptyDescription?: string;
  resolveHref?: HrefResolver;
}) {
  if (items.length === 0) {
    return (
      <AppEmptyState
        compact
        icon={<IconCheckCircle />}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const tone = item.tone ?? "default";
        return (
          <InteractiveCard
            key={item.key}
            asChild
            minHeight="mobile"
            padding="default"
            className={cn(WORKFLOW_CARD_TONE[tone])}
          >
            <Link href={resolveHref(item.href)} className="min-w-0">
              {item.icon ? (
                <span
                  className={cn(
                    "inline-flex shrink-0 rounded-md border bg-background p-2",
                    WORKFLOW_ICON_TONE[tone],
                  )}
                >
                  {item.icon}
                </span>
              ) : null}
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block text-sm font-medium leading-tight">
                  {item.title}
                </span>
                {item.description ? (
                  <span className="block line-clamp-2 text-xs text-muted-foreground">
                    {item.description}
                  </span>
                ) : null}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {item.meta ? (
                  <span className="text-xs text-muted-foreground">
                    {item.meta}
                  </span>
                ) : null}
                {item.badge ? (
                  <Badge variant={item.badgeVariant ?? "secondary"}>
                    {item.badge}
                  </Badge>
                ) : null}
                <span
                  className={cn("size-2 rounded-full", WORKFLOW_DOT_TONE[tone])}
                />
              </span>
            </Link>
          </InteractiveCard>
        );
      })}
    </div>
  );
}
