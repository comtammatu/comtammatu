"use client";

import { formatPercent, formatVND } from "@comtammatu/shared/format";
import { formatVNBusinessDate, getVNBusinessDateString } from "@comtammatu/shared/time";
import { Progress } from "@comtammatu/ui/components/progress";
import { BranchOperatorPanel } from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import {
  daysInMonthFromStart,
  isRevenueRewardTierAchieved,
  monthStartFromIsoDate,
  nextRevenueRewardGap,
  paceTargetAmount,
  progressTrackPosition,
  progressTrackScale,
  targetProgressTone,
} from "@/(protected)/finance/_lib/revenue-target";
import type { BranchRevenueTargetProgress } from "@/(protected)/finance/targets/actions";

const progressCopy = messages.finance.revenueTargets.progress;
const rewardCopy = messages.finance.revenueTargets.rewardTiers;
const homeCopy = messages.operator.home;

function monthLabel(yearMonth: string): string {
  const monthStart = monthStartFromIsoDate(yearMonth);
  const month = Number(monthStart.slice(5, 7));
  const year = monthStart.slice(0, 4);
  if (!Number.isFinite(month) || year.length !== 4) return yearMonth;
  return progressCopy.monthCaption(month, year);
}

function rewardLabel(
  rewardType: "fixed_amount" | "revenue_percent",
  rewardValue: number,
): string {
  return rewardType === "fixed_amount"
    ? formatVND(rewardValue)
    : `${formatPercent(rewardValue, 2)} ${progressCopy.revenueLabel}`;
}

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
  const businessDate = getVNBusinessDateString();
  const nextGap = nextRevenueRewardGap(
    progress.netRevenueMtd,
    progress.targetAmount,
    progress.rewardTiers,
  );
  const dayIndex = Number(businessDate.slice(8, 10));
  const daysInMonth = daysInMonthFromStart(
    monthStartFromIsoDate(progress.yearMonth),
  );
  const paceAmount =
    hasTarget && Number.isFinite(dayIndex)
      ? paceTargetAmount(progress.targetAmount ?? 0, dayIndex, daysInMonth)
      : 0;

  const markers = [
    { key: "target", thresholdPct: 100 },
    ...progress.rewardTiers.map((tier) => ({
      key: `tier-${tier.thresholdPct}`,
      thresholdPct: tier.thresholdPct,
    })),
  ].filter(
    (marker, index, list) =>
      list.findIndex((item) => item.thresholdPct === marker.thresholdPct) ===
      index,
  );

  return (
    <BranchOperatorPanel title={homeCopy.revenueTargetTitle} size="sm">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex min-w-0 flex-col gap-1 rounded-md bg-muted/50 px-3 py-2.5">
            <span className="text-xs font-medium text-muted-foreground">
              {progressCopy.monthRevenueLabel}
            </span>
            <span className="text-base font-semibold tabular-nums text-foreground">
              {formatVND(progress.netRevenueMtd)}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {monthLabel(progress.yearMonth)}
            </span>
          </div>
          <div className="flex min-w-0 flex-col gap-1 rounded-md bg-muted/50 px-3 py-2.5">
            <span className="text-xs font-medium text-muted-foreground">
              {progressCopy.dayRevenueLabel}
            </span>
            <span className="text-base font-semibold tabular-nums text-foreground">
              {formatVND(progress.netRevenueToday)}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {progressCopy.businessDayCaption(
                formatVNBusinessDate(businessDate),
              )}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 text-sm text-muted-foreground">
              {progressCopy.targetLabel}
              {hasTarget ? (
                <span className="ml-1 font-semibold tabular-nums text-foreground">
                  {formatVND(progress.targetAmount ?? 0)}
                </span>
              ) : (
                <span className="ml-1 font-medium text-foreground">
                  {progressCopy.noTarget}
                </span>
              )}
            </span>
            {hasTarget && progress.progressPct != null ? (
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
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
                  className="h-2.5 rounded-full"
                />
                {markers.map((marker) => {
                  const achieved = isRevenueRewardTierAchieved(
                    progress.progressPct,
                    marker.thresholdPct,
                  );
                  const left = progressTrackPosition(marker.thresholdPct, scale);
                  return (
                    <span
                      key={marker.key}
                      aria-hidden="true"
                      className={
                        achieved
                          ? "pointer-events-none absolute top-1/2 z-10 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-success ring-2 ring-background"
                          : "pointer-events-none absolute top-1/2 z-10 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background ring-2 ring-border"
                      }
                      style={{ left: left.toFixed(2) + "%" }}
                    />
                  );
                })}
              </div>
              {progress.rewardTiers.length > 0 ? (
                <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {progress.rewardTiers.map((tier) => {
                    const achieved = isRevenueRewardTierAchieved(
                      progress.progressPct,
                      tier.thresholdPct,
                    );
                    const threshold = formatPercent(tier.thresholdPct, 2);
                    const reward = rewardLabel(tier.rewardType, tier.rewardValue);
                    return (
                      <li
                        key={tier.thresholdPct}
                        className="flex min-w-0 items-baseline justify-between gap-2 text-xs"
                      >
                        <span className="min-w-0 truncate text-muted-foreground">
                          {rewardCopy.milestone(threshold)}
                          {" · "}
                          {rewardCopy.reward(reward)}
                        </span>
                        <span
                          className={
                            achieved
                              ? "shrink-0 font-medium text-success"
                              : "shrink-0 text-muted-foreground"
                          }
                        >
                          {achieved ? rewardCopy.achieved : rewardCopy.pending}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                {nextGap ? (
                  <span>
                    {progressCopy.nextMilestone(
                      formatPercent(nextGap.thresholdPct, 2),
                      formatVND(nextGap.gapAmount),
                    )}
                  </span>
                ) : progress.gapAmount != null && progress.gapAmount > 0 ? (
                  <span>{progressCopy.remaining(formatVND(progress.gapAmount))}</span>
                ) : progress.progressPct != null && progress.progressPct >= 100 ? (
                  <span>{progressCopy.achieved}</span>
                ) : null}
                {paceAmount > 0 ? (
                  <span>{progressCopy.paceToday(formatVND(paceAmount))}</span>
                ) : null}
                <span>{progressCopy.dayHint}</span>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </BranchOperatorPanel>
  );
}
