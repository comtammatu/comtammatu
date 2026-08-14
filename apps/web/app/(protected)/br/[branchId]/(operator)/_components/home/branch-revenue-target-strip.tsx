"use client";

import { formatPercent, formatVND } from "@comtammatu/shared/format";
import { Progress } from "@comtammatu/ui/components/progress";
import { BranchOperatorPanel } from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import {
  isRevenueRewardTierAchieved,
  progressTrackPosition,
  progressTrackScale,
  targetProgressTone,
} from "@/(protected)/finance/_lib/revenue-target";
import type { BranchRevenueTargetProgress } from "@/(protected)/finance/targets/actions";

const progressCopy = messages.finance.revenueTargets.progress;
const rewardCopy = messages.finance.revenueTargets.rewardTiers;
const homeCopy = messages.operator.home;

export function BranchRevenueTargetStrip({
  progress,
}: {
  progress: BranchRevenueTargetProgress;
}) {
  const tone = targetProgressTone(progress.progressPct);
  const hasTarget = progress.targetAmount != null && progress.targetAmount > 0;
  const scale = progressTrackScale(
    progress.progressPct,
    progress.rewardTiers.map((tier) => tier.thresholdPct),
  );
  const fillPct = progressTrackPosition(progress.progressPct ?? 0, scale);
  const progressTone =
    tone === "neutral"
      ? "default"
      : (tone as "success" | "warning" | "destructive");

  return (
    <BranchOperatorPanel title={homeCopy.revenueTargetTitle} size="sm">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex min-w-0 flex-col gap-0.5 rounded-md bg-muted/50 px-3 py-2.5">
            <span className="text-xs font-medium text-muted-foreground">
              {progressCopy.monthRevenueLabel}
            </span>
            <span className="text-base font-semibold tabular-nums text-foreground">
              {formatVND(progress.netRevenueMtd)}
            </span>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 rounded-md bg-muted/50 px-3 py-2.5">
            <span className="text-xs font-medium text-muted-foreground">
              {progressCopy.dayRevenueLabel}
            </span>
            <span className="text-base font-semibold tabular-nums text-foreground">
              {formatVND(progress.netRevenueToday)}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {hasTarget
                ? formatVND(progress.targetAmount ?? 0)
                : progressCopy.noTarget}
            </span>
            {hasTarget && progress.progressPct != null ? (
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                {formatPercent(progress.progressPct)}
              </span>
            ) : null}
          </div>
          {hasTarget ? (
            <>
              <div className="relative">
                <Progress
                  value={fillPct}
                  tone={progressTone}
                  className="h-2.5 overflow-visible rounded-full"
                />
                {progress.rewardTiers.map((tier) => {
                  const achieved = isRevenueRewardTierAchieved(
                    progress.progressPct,
                    tier.thresholdPct,
                  );
                  const left = progressTrackPosition(tier.thresholdPct, scale);
                  const rewardValue =
                    tier.rewardType === "fixed_amount"
                      ? formatVND(tier.rewardValue)
                      : `${formatPercent(tier.rewardValue, 2)} ${progressCopy.revenueLabel}`;
                  return (
                    <span
                      key={tier.thresholdPct}
                      aria-label={`${rewardCopy.milestone(formatPercent(tier.thresholdPct, 2))}. ${rewardCopy.reward(rewardValue)}. ${achieved ? rewardCopy.achieved : rewardCopy.pending}`}
                      className={
                        achieved
                          ? "pointer-events-none absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-success ring-2 ring-background"
                          : "pointer-events-none absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background ring-2 ring-border"
                      }
                      style={{ left: `${left}%` }}
                    />
                  );
                })}
              </div>
              <span className="text-xs text-muted-foreground">
                {progress.gapAmount != null && progress.gapAmount > 0
                  ? progressCopy.remaining(formatVND(progress.gapAmount))
                  : progress.progressPct != null && progress.progressPct >= 100
                    ? progressCopy.achieved
                    : null}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </BranchOperatorPanel>
  );
}
