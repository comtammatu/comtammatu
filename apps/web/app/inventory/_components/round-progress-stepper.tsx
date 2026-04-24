"use client";

import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { IconCheck } from "@tabler/icons-react";

interface RoundProgressStepperProps {
  /** Current round the session is in (1..4). */
  currentRound: number;
  /** Per-round counts finalized. Indexed [1..4]. */
  finalByRound?: Partial<Record<1 | 2 | 3 | 4, number>>;
  /** Per-round counts needing recount. */
  needsRecountByRound?: Partial<Record<1 | 2 | 3 | 4, number>>;
  /** Highlight round 4 as escalation requirement. */
  round4Escalated?: boolean;
  className?: string;
}

/**
 * 4-round progress stepper (S13a).
 *
 * Round semantics per spec §Q2:
 *   R1: initial count (all lines)
 *   R2: recount of flagged lines
 *   R3: 2nd recount if still divergent
 *   R4: QLV + admin manual final — escalation only
 *
 * Ticks turn green as each round closes with no needs_recount.
 * Round 4 shown in red when escalation triggered.
 */
export function RoundProgressStepper({
  currentRound,
  finalByRound,
  needsRecountByRound,
  round4Escalated,
  className,
}: RoundProgressStepperProps) {
  const rounds = [1, 2, 3, 4] as const;

  return (
    <div
      className={cn("flex items-center gap-1", className)}
      data-slot="round-progress-stepper"
    >
      {rounds.map((r, idx) => {
        const isActive = r === currentRound;
        const isPast = r < currentRound;
        const finals = finalByRound?.[r] ?? 0;
        const pending = needsRecountByRound?.[r] ?? 0;
        const escalated = r === 4 && round4Escalated;

        const tone = escalated
          ? "border-red-400 bg-red-50 text-red-900"
          : isActive
            ? "border-primary bg-primary/10 text-primary"
            : isPast
              ? "border-green-400 bg-green-50 text-green-900"
              : "border-muted bg-muted/30 text-muted-foreground";

        return (
          <div key={r} className="flex items-center gap-1">
            <div
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs",
                tone,
              )}
              data-round={r}
              data-state={
                escalated
                  ? "escalated"
                  : isActive
                    ? "active"
                    : isPast
                      ? "done"
                      : "pending"
              }
            >
              {isPast ? (
                <IconCheck className="size-3.5" />
              ) : (
                <span className="font-semibold">R{r}</span>
              )}
              <span>
                {escalated
                  ? "Escalation QLV+Admin"
                  : r === 1
                    ? "Đếm lần 1"
                    : r === 4
                      ? "Round 4"
                      : `Recount ${r - 1}`}
              </span>
              {finals > 0 ? (
                <Badge variant="outline" className="text-[10px]">
                  {finals} final
                </Badge>
              ) : null}
              {pending > 0 ? (
                <Badge
                  variant="outline"
                  className="border-orange-300 text-orange-900 text-[10px]"
                >
                  {pending} cần recount
                </Badge>
              ) : null}
            </div>
            {idx < rounds.length - 1 ? (
              <div
                className={cn(
                  "h-0.5 w-4",
                  isPast ? "bg-green-400" : "bg-muted",
                )}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
