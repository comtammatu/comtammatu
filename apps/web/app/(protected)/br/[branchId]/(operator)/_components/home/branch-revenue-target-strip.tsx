"use client";

import { ChevronDown as IconChevronDown, Trophy } from "lucide-react";
import { formatPercent, formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@comtammatu/ui/components/collapsible";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Progress } from "@comtammatu/ui/components/progress";
import { BranchOperatorPanel } from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import {
  clampProgressValue,
  isRevenueRewardTierAchieved,
  targetProgressTone,
} from "@/(protected)/finance/_lib/revenue-target";
import type { BranchRevenueTargetProgress } from "@/(protected)/finance/targets/actions";

const progressCopy = messages.finance.revenueTargets.progress;
const rewardCopy = messages.finance.revenueTargets.rewardTiers;

export function BranchRevenueTargetStrip({
  progress,
}: {
  progress: BranchRevenueTargetProgress;
}) {
  const tone = targetProgressTone(progress.progressPct);
  const hasTarget = progress.targetAmount != null && progress.targetAmount > 0;
  const progressValue = clampProgressValue(progress.progressPct);
  const progressTone =
    tone === "neutral"
      ? "default"
      : (tone as "success" | "warning" | "destructive");
  const tierCount = progress.rewardTiers.length;
  const achievedCount = progress.rewardTiers.filter((tier) =>
    isRevenueRewardTierAchieved(progress.progressPct, tier.thresholdPct),
  ).length;

  return (
    <BranchOperatorPanel title={progressCopy.targetLabel} size="sm">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex min-w-0 flex-col gap-1 rounded-md bg-muted/40 px-3 py-2.5">
            <span className="text-xs font-medium text-muted-foreground">
              {progressCopy.monthRevenueLabel}
            </span>
            <span className="text-base font-semibold tabular-nums text-foreground">
              {formatVND(progress.netRevenueMtd)}
            </span>
            <span className="text-xs text-muted-foreground">
              {progressCopy.mtdHint}
            </span>
          </div>
          <div className="flex min-w-0 flex-col gap-1 rounded-md bg-muted/40 px-3 py-2.5">
            <span className="text-xs font-medium text-muted-foreground">
              {progressCopy.dayRevenueLabel}
            </span>
            <span className="text-base font-semibold tabular-nums text-foreground">
              {formatVND(progress.netRevenueToday)}
            </span>
            <span className="text-xs text-muted-foreground">
              {progressCopy.dayHint}
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
              <Progress
                value={progressValue}
                tone={progressTone}
                className="h-1.5 rounded-full"
              />
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

        <Collapsible>
          <CollapsibleTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="touch"
                className="group w-full justify-between gap-2 px-3 font-normal"
              />
            }
          >
            <span className="flex min-w-0 items-center gap-2">
              <Trophy
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="truncate text-sm font-medium text-foreground">
                {rewardCopy.trackingTitle}
              </span>
              {tierCount > 0 ? (
                <Badge
                  variant={achievedCount > 0 ? "success" : "secondary"}
                  className="shrink-0"
                >
                  {achievedCount > 0
                    ? `${achievedCount}/${tierCount}`
                    : rewardCopy.count(tierCount)}
                </Badge>
              ) : null}
            </span>
            <IconChevronDown
              className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180"
              aria-hidden
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            {tierCount === 0 ? (
              <p className="text-sm text-muted-foreground">{rewardCopy.empty}</p>
            ) : (
              <ItemGroup className="grid gap-2" role="list">
                {progress.rewardTiers.map((tier) => {
                  const achieved = isRevenueRewardTierAchieved(
                    progress.progressPct,
                    tier.thresholdPct,
                  );
                  const rewardValue =
                    tier.rewardType === "fixed_amount"
                      ? formatVND(tier.rewardValue)
                      : `${formatPercent(tier.rewardValue, 2)} Doanh thu thuần`;
                  return (
                    <Item
                      key={tier.thresholdPct}
                      variant="outline"
                      size="sm"
                      role="listitem"
                    >
                      <ItemContent>
                        <ItemTitle>
                          {rewardCopy.milestone(
                            formatPercent(tier.thresholdPct, 2),
                          )}
                        </ItemTitle>
                        <ItemDescription>
                          {rewardCopy.reward(rewardValue)}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <Badge variant={achieved ? "success" : "outline"}>
                          {achieved ? rewardCopy.achieved : rewardCopy.pending}
                        </Badge>
                      </ItemActions>
                    </Item>
                  );
                })}
              </ItemGroup>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </BranchOperatorPanel>
  );
}
