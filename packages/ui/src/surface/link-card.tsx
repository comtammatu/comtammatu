"use client";

import * as React from "react";
import type { ReactNode } from "react";
import { ArrowRight as IconArrowRight } from "lucide-react";
import { cn } from "../lib/utils";
import { Badge, type BadgeProps } from "../components/badge";
import { Card, CardContent } from "../components/card";
import type { SurfaceTone } from "./types";

const TONE_CLASSNAME: Record<SurfaceTone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
  secondary: "bg-secondary text-secondary-foreground",
};

export type AppLinkCardProps = {
  href: string;
  title: string;
  description?: string;
  badge?: string;
  badgeVariant?: BadgeProps["variant"];
  icon: ReactNode;
  tone?: SurfaceTone;
  ctaLabel?: string;
  disabled?: boolean;
  disabledReason?: string;
  metric?: { value: ReactNode; label?: string };
  renderLink?: (
    href: string,
    props: { className?: string; children: ReactNode },
  ) => ReactNode;
};

export function AppLinkCard({
  href,
  title,
  description,
  badge,
  badgeVariant = "secondary",
  icon,
  tone = "primary",
  ctaLabel = "Mở chi tiết",
  disabled = false,
  disabledReason,
  metric,
  renderLink,
}: AppLinkCardProps) {
  const topRight = (
    <div className="flex flex-col items-end gap-1">
      {badge ? <Badge variant={badgeVariant}>{badge}</Badge> : null}
      {metric ? (
        <div className="flex flex-col items-end">
          <span className="font-mono text-sm font-semibold tabular-nums">
            {metric.value}
          </span>
          {metric.label ? (
            <span className="text-xs text-muted-foreground">
              {metric.label}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const inner = (
    <div className="group flex h-full flex-col justify-between gap-4 p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div
            className={cn(
              "flex size-10 items-center justify-center rounded-md",
              TONE_CLASSNAME[tone],
            )}
          >
            <span className="inline-flex shrink-0 [&_svg]:size-5">{icon}</span>
          </div>
          {(badge ?? metric) ? topRight : null}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-heading text-base font-semibold tracking-tight">
            {title}
          </p>
          {description ? (
            <p className="text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
          {disabled && disabledReason ? (
            <p className="text-xs text-muted-foreground">{disabledReason}</p>
          ) : null}
        </div>
      </div>
      {!disabled ? (
        <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
          {ctaLabel}
          <IconArrowRight className="size-4" />
        </span>
      ) : null}
    </div>
  );

  const linkNode = renderLink ? (
    renderLink(href, { className: "block h-full", children: inner })
  ) : (
    <a href={href} className="block h-full">
      {inner}
    </a>
  );

  return (
    <Card
      data-slot="app-link-card"
      className={cn(
        "h-full transition",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "hover:shadow-effect-card-hover focus-within:shadow-effect-card-hover focus-within:ring-[3px] focus-within:ring-foreground",
      )}
    >
      <CardContent flush className="h-full">
        {disabled ? (
          <div aria-disabled="true" className="h-full">
            {inner}
          </div>
        ) : (
          linkNode
        )}
      </CardContent>
    </Card>
  );
}

export const LinkCard = AppLinkCard;
export type LinkCardProps = AppLinkCardProps;

export type LinkCardGridProps = {
  children: ReactNode;
  className?: string;
};

export function LinkCardGrid({ children, className }: LinkCardGridProps) {
  return (
    <div
      data-slot="link-card-grid"
      className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
