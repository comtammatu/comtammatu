"use client";

import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { ArrowRight as IconArrowRight } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { cn } from "@comtammatu/ui";
import type { PlaybookSeverity } from "../_lib/playbook-types";

const SEVERITY_DOT: Record<PlaybookSeverity, string> = {
  destructive: "bg-destructive",
  warning: "bg-warning",
  info: "bg-info",
  primary: "bg-primary",
};

const SEVERITY_BORDER: Record<PlaybookSeverity, string> = {
  destructive: "border-l-destructive",
  warning: "border-l-warning",
  info: "border-l-info",
  primary: "border-l-primary",
};

interface PlaybookTaskCardProps {
  icon: ComponentType<{ className?: string }>;
  severity: PlaybookSeverity;
  title: string;
  description: string;
  count?: number;
  meta?: ReactNode;
  /** Inline action buttons (kind-specific). */
  actionSlot?: ReactNode;
  /** Optional secondary "Xem tất cả" deeplink. */
  deeplink?: { href: string; label?: string };
}

/**
 * View-only card for one Today's Playbook task. Knows nothing about task
 * `kind` — caller assembles props. Severity drives visual accent only.
 */
export function PlaybookTaskCard({
  icon: Icon,
  severity,
  title,
  description,
  count,
  meta,
  actionSlot,
  deeplink,
}: PlaybookTaskCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border border-l-4 bg-card p-3",
        SEVERITY_BORDER[severity],
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-1 size-2 shrink-0 rounded-full",
            SEVERITY_DOT[severity],
          )}
          aria-hidden
        />
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="font-semibold leading-tight">{title}</p>
            {count != null ? (
              <Badge variant="outline" className="tabular-nums">
                {count}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      {meta ? (
        <div className="ml-9 text-sm text-muted-foreground">{meta}</div>
      ) : null}

      {actionSlot || deeplink ? (
        <div className="ml-9 flex flex-wrap items-center gap-2">
          {actionSlot}
          {deeplink ? (
            <Button asChild size="sm" variant="ghost">
              <Link href={deeplink.href}>
                {deeplink.label ?? "Xem tất cả"}
                <IconArrowRight className="size-3.5" />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
