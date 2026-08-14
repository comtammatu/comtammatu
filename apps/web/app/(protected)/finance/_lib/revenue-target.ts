import { getVNDateParts } from "@comtammatu/shared/time";

/** First calendar day of the VN month containing `isoDate` (YYYY-MM-DD). */
export function monthStartFromIsoDate(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

/** True when start/end fall in the same VN calendar month. */
export function isSingleCalendarMonth(start: string, end: string): boolean {
  return (
    start.length >= 7 &&
    end.length >= 7 &&
    start.slice(0, 7) === end.slice(0, 7)
  );
}

export function currentVnMonthStart(now: Date = new Date()): string {
  const { year, month } = getVNDateParts(now);
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export type TargetProgressTone =
  "success" | "warning" | "destructive" | "neutral";

export type RevenueRewardType = "fixed_amount" | "revenue_percent";

export type RevenueRewardTier = {
  thresholdPct: number;
  rewardType: RevenueRewardType;
  rewardValue: number;
};

export function normalizeRevenueRewardTiers(
  tiers: RevenueRewardTier[],
): RevenueRewardTier[] | null {
  if (tiers.length > 10) return null;

  const thresholds = new Set<number>();
  for (const tier of tiers) {
    if (
      !Number.isFinite(tier.thresholdPct) ||
      tier.thresholdPct <= 0 ||
      tier.thresholdPct > 1000 ||
      thresholds.has(tier.thresholdPct) ||
      !Number.isFinite(tier.rewardValue) ||
      tier.rewardValue <= 0 ||
      (tier.rewardType === "fixed_amount" &&
        (!Number.isInteger(tier.rewardValue) ||
          tier.rewardValue > 1_000_000_000_000)) ||
      (tier.rewardType === "revenue_percent" && tier.rewardValue > 100)
    ) {
      return null;
    }
    thresholds.add(tier.thresholdPct);
  }

  return [...tiers].sort((a, b) => a.thresholdPct - b.thresholdPct);
}

export function targetProgressTone(
  progressPct: number | null | undefined,
): TargetProgressTone {
  if (progressPct == null || !Number.isFinite(progressPct)) return "neutral";
  if (progressPct >= 100) return "success";
  if (progressPct >= 80) return "warning";
  return "destructive";
}

export function clampProgressValue(
  progressPct: number | null | undefined,
): number {
  if (progressPct == null || !Number.isFinite(progressPct)) return 0;
  return Math.max(0, Math.min(100, progressPct));
}

/** Domain for a target bar that can show reward markers above 100%. */
export function progressTrackScale(
  progressPct: number | null | undefined,
  thresholds: readonly number[] = [],
): number {
  const values = [100];
  if (progressPct != null && Number.isFinite(progressPct)) {
    values.push(progressPct);
  }
  for (const threshold of thresholds) {
    if (Number.isFinite(threshold) && threshold > 0) values.push(threshold);
  }
  return Math.max(...values);
}

export function progressTrackPosition(valuePct: number, scale: number): number {
  if (!Number.isFinite(valuePct) || !Number.isFinite(scale) || scale <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (valuePct / scale) * 100));
}

export function isRevenueRewardTierAchieved(
  progressPct: number | null | undefined,
  thresholdPct: number,
): boolean {
  return (
    progressPct != null &&
    Number.isFinite(progressPct) &&
    Number.isFinite(thresholdPct) &&
    progressPct >= thresholdPct
  );
}

export function previewTargetProgress(
  currentNetRevenue: number | null,
  targetAmount: number | null,
): { progressPct: number; gapAmount: number } | null {
  if (
    currentNetRevenue == null ||
    targetAmount == null ||
    !Number.isFinite(currentNetRevenue) ||
    !Number.isFinite(targetAmount) ||
    targetAmount <= 0
  ) {
    return null;
  }
  return {
    progressPct: (currentNetRevenue / targetAmount) * 100,
    gapAmount: Math.max(targetAmount - currentNetRevenue, 0),
  };
}

/** Linear pace target for day index (1-based) within a month. */
export function paceTargetAmount(
  monthlyTarget: number,
  dayIndex: number,
  daysInMonth: number,
): number {
  if (monthlyTarget <= 0 || daysInMonth <= 0 || dayIndex <= 0) return 0;
  return (monthlyTarget * Math.min(dayIndex, daysInMonth)) / daysInMonth;
}

export function daysInMonthFromStart(monthStart: string): number {
  const year = Number(monthStart.slice(0, 4));
  const month = Number(monthStart.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return 30;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
