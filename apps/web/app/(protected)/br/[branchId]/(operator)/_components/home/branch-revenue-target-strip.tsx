import { Trophy } from "lucide-react";
import { formatPercent, formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Progress } from "@comtammatu/ui/components/progress";
import { KpiCard } from "@/components/kpi/kpi-card";
import { KpiRow } from "@/components/surface";
import { BranchOperatorPanel } from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import {
  clampProgressValue,
  isRevenueRewardTierAchieved,
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
    <div className="grid gap-3">
      <KpiRow density="compact" className="grid-cols-1 sm:grid-cols-2">
        <KpiCard
          density="compact"
          label={progressCopy.revenueLabel}
          value={formatVND(progress.netRevenueMtd)}
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
                    : progress.progressPct != null &&
                        progress.progressPct >= 100
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

      <BranchOperatorPanel
        title={messages.finance.revenueTargets.rewardTiers.trackingTitle}
        description={messages.finance.revenueTargets.rewardTiers.description}
        icon={Trophy}
        size="sm"
        badge={{ children: String(progress.rewardTiers.length) }}
      >
        {progress.rewardTiers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {messages.finance.revenueTargets.rewardTiers.empty}
          </p>
        ) : (
          <ItemGroup className="grid gap-2 sm:grid-cols-2" role="list">
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
                      {messages.finance.revenueTargets.rewardTiers.milestone(
                        formatPercent(tier.thresholdPct, 2),
                      )}
                    </ItemTitle>
                    <ItemDescription>
                      {messages.finance.revenueTargets.rewardTiers.reward(
                        rewardValue,
                      )}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Badge variant={achieved ? "success" : "outline"}>
                      {achieved
                        ? messages.finance.revenueTargets.rewardTiers.achieved
                        : messages.finance.revenueTargets.rewardTiers.pending}
                    </Badge>
                  </ItemActions>
                </Item>
              );
            })}
          </ItemGroup>
        )}
      </BranchOperatorPanel>
    </div>
  );
}
