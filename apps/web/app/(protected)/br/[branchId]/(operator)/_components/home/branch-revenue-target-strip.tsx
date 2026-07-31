import {
  formatCompactVND,
  formatPercent,
  formatVND,
} from "@comtammatu/shared/format";
import { Progress } from "@comtammatu/ui/components/progress";
import { KpiCard } from "@/components/kpi/kpi-card";
import { KpiRow } from "@/components/surface";
import { messages } from "@lib/messages";
import {
  clampProgressValue,
  targetProgressTone,
} from "@/(protected)/finance/_lib/revenue-target";
import type { BranchRevenueTargetProgress } from "@/(protected)/finance/targets/actions";

const progressCopy = messages.finance.revenueTargets.progress;

export function BranchRevenueTargetStrip({
  progress,
}: {
  progress: BranchRevenueTargetProgress;
}) {
  const tone = targetProgressTone(progress.progressPct);
  const hasTarget = progress.targetAmount != null && progress.targetAmount > 0;
  const progressValue = clampProgressValue(progress.progressPct);

  return (
    <KpiRow density="compact" className="grid-cols-1 sm:grid-cols-2">
      <KpiCard
        density="compact"
        label={progressCopy.revenueLabel}
        value={formatVND(progress.netRevenueMtd)}
        shortValue={formatCompactVND(progress.netRevenueMtd)}
        hint={progressCopy.mtdHint}
        tone="primary"
      />
      <KpiCard
        density="compact"
        label={progressCopy.targetLabel}
        value={
          hasTarget
            ? formatVND(progress.targetAmount ?? 0)
            : progressCopy.noTarget
        }
        shortValue={
          hasTarget ? formatCompactVND(progress.targetAmount ?? 0) : undefined
        }
        tone={hasTarget ? tone : "neutral"}
        hint={
          hasTarget ? (
            <div className="flex w-full flex-col gap-1.5">
              <Progress
                value={progressValue}
                tone={
                  tone === "neutral"
                    ? "default"
                    : (tone as "success" | "warning" | "destructive")
                }
                className="h-1.5 rounded-full"
              />
              <span>
                {progress.progressPct != null
                  ? formatPercent(progress.progressPct)
                  : null}
                {progress.gapAmount != null && progress.gapAmount > 0
                  ? ` · ${progressCopy.remaining(formatVND(progress.gapAmount))}`
                  : progress.progressPct != null && progress.progressPct >= 100
                    ? ` · ${progressCopy.achieved}`
                    : null}
              </span>
            </div>
          ) : (
            progressCopy.noTarget
          )
        }
      />
    </KpiRow>
  );
}
