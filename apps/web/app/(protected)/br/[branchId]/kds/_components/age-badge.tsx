"use client";

import { KITCHEN_SLA } from "@lib/operational-sla";
import { cn } from "@comtammatu/ui";
import { TriangleAlert as IconAlert } from "lucide-react";
import {
  formatKdsElapsedClock,
  getElapsedMinutes,
} from "../_lib/age-style";

type AgeBadgeSize = "compact" | "default" | "lg";

const SIZE_CLASS: Record<
  AgeBadgeSize,
  { container: string; number: string }
> = {
  compact: {
    container: "rounded-md px-2 py-1 xl:px-2.5",
    number: "text-xs xl:text-sm",
  },
  default: {
    container: "rounded-md px-3 py-1",
    number: "text-base",
  },
  lg: {
    container: "rounded-md px-3 py-1.5",
    number: "text-lg",
  },
};

interface AgeBadgeProps {
  elapsedMs: number;
  isComplete: boolean;
  size?: AgeBadgeSize;
}

export function AgeBadge({
  elapsedMs,
  isComplete,
  size = "default",
}: AgeBadgeProps) {
  const sizeClass = SIZE_CLASS[size];
  const elapsedMinutes = getElapsedMinutes(elapsedMs);
  const isUrgent =
    !isComplete && elapsedMinutes >= KITCHEN_SLA.URGENT_MINUTES;
  const isLate =
    !isComplete && elapsedMinutes >= KITCHEN_SLA.WARNING_MINUTES;
  const tierSuffix = isComplete
    ? ""
    : isUrgent
      ? ", quá hạn"
      : isLate
        ? ", trễ"
        : "";
  return (
    <div
      aria-label={`${elapsedMinutes} phút${tierSuffix}`}
      className={cn(
        "flex shrink-0 items-center justify-center gap-1 border text-center",
        sizeClass.container,
        isComplete
          ? "border-success/20 bg-success/15 text-success"
          : isUrgent
            ? "border-destructive/20 bg-destructive/15 font-semibold text-destructive"
            : isLate
              ? "border-warning/20 bg-warning/15 font-semibold text-warning"
              : "border-border/50 bg-background/80 text-muted-foreground",
      )}
    >
      {isLate ? (
        <IconAlert className="size-3 shrink-0" aria-hidden />
      ) : null}
      <span
        className={cn(
          "font-mono font-semibold leading-none tabular-nums",
          sizeClass.number,
        )}
      >
        {formatKdsElapsedClock(elapsedMs)}
      </span>
    </div>
  );
}
