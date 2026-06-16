"use client";

import { cn } from "@comtammatu/ui";

type AgeBadgeSize = "compact" | "default" | "lg";

const SIZE_CLASS: Record<
  AgeBadgeSize,
  { container: string; number: string; label: string }
> = {
  compact: {
    container: "rounded-md px-2 py-0.5 xl:px-2.5 xl:py-1",
    number: "text-xs xl:text-sm",
    label: "text-xs xl:text-sm",
  },
  default: {
    container: "rounded-full px-3 py-1",
    number: "text-base",
    label: "text-xs",
  },
  lg: {
    container: "rounded-full px-3 py-1.5",
    number: "text-lg",
    label: "text-sm",
  },
};

interface AgeBadgeProps {
  elapsedMinutes: number;
  isComplete: boolean;
  size?: AgeBadgeSize;
}

export function AgeBadge({
  elapsedMinutes,
  isComplete,
  size = "default",
}: AgeBadgeProps) {
  const sizeClass = SIZE_CLASS[size];
  const tierSuffix = isComplete
    ? ""
    : elapsedMinutes >= 10
      ? ", quá hạn"
      : elapsedMinutes >= 5
        ? ", trễ"
        : "";
  return (
    <div
      aria-label={`${elapsedMinutes} phút${tierSuffix}`}
      className={cn(
        "flex shrink-0 items-baseline justify-center gap-1 border text-center",
        sizeClass.container,
        isComplete
          ? "border-success/40 bg-success/15 text-success"
          : elapsedMinutes >= 10
            ? "border-destructive/40 bg-destructive/15 text-destructive motion-safe:animate-pulse"
            : elapsedMinutes >= 5
              ? "border-warning/40 bg-warning/15 text-warning"
              : "border-border/50 bg-background/80 text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "font-mono font-semibold leading-none tabular-nums",
          sizeClass.number,
        )}
      >
        {elapsedMinutes}
      </span>
      <span
        className={cn("font-semibold uppercase opacity-70", sizeClass.label)}
      >
        p
      </span>
    </div>
  );
}
