"use client";

import { cn } from "@comtammatu/ui";

type AgeBadgeSize = "default" | "lg";

const SIZE_CLASS: Record<
  AgeBadgeSize,
  { container: string; number: string; label: string }
> = {
  default: {
    container: "rounded-full px-2.5 py-1",
    number: "text-sm",
    label: "text-xs",
  },
  lg: {
    container: "rounded-full px-2.5 py-1",
    number: "text-base",
    label: "text-xs",
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
  return (
    <div
      aria-label={`${elapsedMinutes} phút`}
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
