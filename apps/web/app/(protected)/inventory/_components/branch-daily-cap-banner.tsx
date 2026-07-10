"use client";

import { cn } from "@comtammatu/ui";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { TriangleAlert as IconAlertTriangle } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { INVENTORY_VI } from "@comtammatu/shared/messages";

interface BranchDailyCapBannerProps {
  /** Today's cumulative branch waste (all users, all SKUs). */
  branchToday: number;
  /** Dynamic cap from branch_daily_waste_cap (nightly cron). */
  branchCap: number;
  /** Preview: how much this form's waste will add. */
  pendingDelta?: number;
  className?: string;
}

/**
 * Branch daily waste cap banner (S11 §B4).
 *
 * Shown at top of waste form when approaching or exceeding branch cap.
 * Silent under 70% — user doesn't need to see; visible 70%+ as warning,
 * blocking banner when projected exceed.
 *
 * Server-side enforcement: whenever `branch_today + line > cap`,
 * the waste-tier trigger forces tier 2 (approval required). UI just
 * gives early heads-up.
 */
export function BranchDailyCapBanner({
  branchToday,
  branchCap,
  pendingDelta,
  className,
}: BranchDailyCapBannerProps) {
  const projected =
    typeof pendingDelta === "number" && Number.isFinite(pendingDelta)
      ? Math.max(0, branchToday + pendingDelta)
      : branchToday;

  const pct = branchCap > 0 ? projected / branchCap : 0;
  const willExceed = projected > branchCap;

  if (pct < 0.7) return null;

  const tone = willExceed ? "destructive" : "default";

  return (
    <Alert
      variant={tone}
      className={cn(
        !willExceed &&
          "border-warning/20 bg-warning/10 text-warning",
        className,
      )}
      data-slot="branch-daily-cap-banner"
    >
      <IconAlertTriangle className="size-4" />
      <AlertDescription>
        <strong className="block">
          {INVENTORY_VI.branchTodayUsage(
            formatVND(projected),
            formatVND(branchCap),
            Math.round(pct * 100),
          )}
        </strong>
        {willExceed
          ? INVENTORY_VI.branchOverCapBanner
          : INVENTORY_VI.branchNearCapBanner}
      </AlertDescription>
    </Alert>
  );
}
