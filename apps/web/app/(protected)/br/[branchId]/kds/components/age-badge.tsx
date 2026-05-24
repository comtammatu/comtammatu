"use client";

import { cn } from "@comtammatu/ui";

type AgeBadgeSize = "default" | "lg";

const SIZE_CLASS: Record<
  AgeBadgeSize,
  { container: string; number: string; label: string }
> = {
  default: {
    container: "min-h-14 w-16 px-2 py-1",
    number: "text-2xl",
    label: "text-xs",
  },
  // Scale-display tier for KDS focus mode (1 order/screen, arms-length read).
  // text-3xl + tabular-nums qualifies for the numeric-input-echo carve-out
  // (UI-HEADING-SCALE-LOCKED) and matches the "scale display" use case.
  lg: {
    container: "min-h-20 w-24 px-3 py-2",
    number: "text-3xl",
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
  return (
    <div
      aria-label={`${elapsedMinutes} phút`}
      className={cn(
        "flex shrink-0 flex-col items-center justify-center border text-center",
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
        phút
      </span>
    </div>
  );
}
