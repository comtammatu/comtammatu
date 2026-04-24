"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import { cn } from "@comtammatu/ui";

interface AgeBadgeProps {
  elapsedMinutes: number;
  isComplete: boolean;
}

export function AgeBadge({ elapsedMinutes, isComplete }: AgeBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "flex shrink-0 flex-col items-center gap-0 rounded-lg border px-3 py-2",
        isComplete
          ? "border-success/40 bg-success/15 text-success"
          : elapsedMinutes >= 10
            ? "border-destructive/40 bg-destructive/15 text-destructive animate-pulse"
            : elapsedMinutes >= 5
              ? "border-warning/40 bg-warning/15 text-warning"
              : "border-border/50 bg-background/80 text-muted-foreground",
      )}
    >
      <span className="text-2xl font-black leading-none tabular-nums">
        {elapsedMinutes}
      </span>
      <span className="text-xs font-bold uppercase opacity-70">phút</span>
    </Badge>
  );
}
