"use client";

import { useState } from "react";
import { formatPercent, formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
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
import { AppSheet } from "@/components/surface";

const progressCopy = messages.finance.revenueTargets.progress;
const rewardCopy = messages.finance.revenueTargets.rewardTiers;
const homeCopy = messages.operator.home;

function rewardLabel(
  rewardType: "fixed_amount" | "revenue_percent",
  rewardValue: number,
): string {
  return rewardType === "fixed_amount"
    ? formatVND(rewardValue)
    : `${formatPercent(rewardValue, 2)} ${progressCopy.revenueLabel}`;
}

type MilestoneRow = {
  thresholdPct: number;
  reward: string | null;
};

function milestoneRows(progress: BranchRevenueTargetProgress): MilestoneRow[] {
  const rows: MilestoneRow[] = progress.rewardTiers.map((tier) => ({
    thresholdPct: tier.thresholdPct,
    reward: rewardLabel(tier.rewardType, tier.rewardValue),
  }));
  if (!rows.some((row) => row.thresholdPct === 100)) {
    rows.push({ thresholdPct: 100, reward: null });
  }
  return rows.sort((left, right) => left.thresholdPct - right.thresholdPct);
}

export function BranchRevenueTargetStrip({
  progress,
}: {
  progress: BranchRevenueTargetProgress;
}) {
  const [milestonesOpen, setMilestonesOpen] = useState(false);
  const tone = targetProgressTone(progress.progressPct);
  const hasTarget = progress.targetAmount != null && progress.targetAmount > 0;
  const rows = milestoneRows(progress);
  const scale = progressTrackScale(
    progress.progressPct,
    rows.map((row) => row.thresholdPct),
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
          <div className="flex min-w-0 flex-col gap-1 rounded-md bg-muted/50 px-3 py-2.5">
            <span className="text-xs font-medium text-muted-foreground">
              {progressCopy.monthRevenueLabel}
            </span>
            <span className="text-base font-semibold tabular-nums text-foreground">
              {formatVND(progress.netRevenueMtd)}
            </span>
          </div>
          <div className="flex min-w-0 flex-col gap-1 rounded-md bg-muted/50 px-3 py-2.5">
            <span className="text-xs font-medium text-muted-foreground">
              {progressCopy.dayRevenueLabel}
            </span>
            <span className="text-base font-semibold tabular-nums text-foreground">
              {formatVND(progress.netRevenueToday)}
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
            <Button
              type="button"
              variant="ghost"
              size="touch"
              className="relative w-full px-0 hover:bg-transparent"
              aria-label={rewardCopy.trackingTitle}
              onClick={() => setMilestonesOpen(true)}
            >
              <Progress
                value={fillPct}
                tone={progressTone}
                className="pointer-events-none h-2.5 w-full rounded-full"
              />
              {rows.map((row) => {
                const achieved = isRevenueRewardTierAchieved(
                  progress.progressPct,
                  row.thresholdPct,
                );
                const left = progressTrackPosition(row.thresholdPct, scale);
                return (
                  <span
                    key={row.thresholdPct}
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
            </Button>
          ) : null}
        </div>
      </div>

      <AppSheet
        open={milestonesOpen}
        onOpenChange={setMilestonesOpen}
        title={rewardCopy.trackingTitle}
        size="md"
        side="bottom"
      >
        <ItemGroup>
          {rows.map((row) => {
            const achieved = isRevenueRewardTierAchieved(
              progress.progressPct,
              row.thresholdPct,
            );
            const needed =
              progress.targetAmount != null
                ? (progress.targetAmount * row.thresholdPct) / 100
                : null;
            const gap =
              needed != null
                ? Math.max(needed - progress.netRevenueMtd, 0)
                : null;
            const threshold = formatPercent(row.thresholdPct, 2);
            return (
              <Item key={row.thresholdPct} variant="outline">
                <ItemContent>
                  <ItemTitle>{rewardCopy.milestone(threshold)}</ItemTitle>
                  <ItemDescription>
                    {row.reward
                      ? rewardCopy.reward(row.reward)
                      : progressCopy.targetLabel}
                    {" · "}
                    {achieved
                      ? rewardCopy.achieved
                      : gap != null
                        ? progressCopy.remaining(formatVND(gap))
                        : rewardCopy.pending}
                  </ItemDescription>
                </ItemContent>
              </Item>
            );
          })}
        </ItemGroup>
      </AppSheet>
    </BranchOperatorPanel>
  );
}
