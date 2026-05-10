"use client";

import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";

import { cn } from "../lib/utils";

type ProgressTone = "default" | "success" | "warning" | "destructive";
type ProgressSize = "xs" | "sm" | "default" | "lg";

const PROGRESS_INDICATOR_CLASS: Record<ProgressTone, string> = {
  default: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

const PROGRESS_SIZE_CLASS: Record<ProgressSize, string> = {
  xs: "h-1",
  sm: "h-1.5",
  default: "h-2",
  lg: "h-3",
};

function Progress({
  className,
  value,
  max = 100,
  tone = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  tone?: ProgressTone;
  size?: ProgressSize;
}) {
  const normalizedValue =
    typeof value === "number" && max > 0
      ? Math.min(100, Math.max(0, (value / max) * 100))
      : 0;

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      data-size={size}
      data-tone={tone}
      value={value}
      max={max}
      className={cn(
        "relative flex w-full items-center overflow-x-hidden rounded-full bg-muted",
        PROGRESS_SIZE_CLASS[size],
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "size-full flex-1 transition-all",
          PROGRESS_INDICATOR_CLASS[tone],
        )}
        style={{ transform: `translateX(-${100 - normalizedValue}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
export type { ProgressSize, ProgressTone };
