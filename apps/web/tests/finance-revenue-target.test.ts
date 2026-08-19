import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampProgressValue,
  daysInMonthFromStart,
  isRevenueRewardTierAchieved,
  isSingleCalendarMonth,
  monthStartFromIsoDate,
  nextRevenueRewardGap,
  normalizeRevenueRewardTiers,
  paceTargetAmount,
  previewTargetProgress,
  progressTrackPosition,
  progressTrackScale,
  targetProgressTone,
} from "../app/(protected)/finance/_lib/revenue-target";

describe("revenue-target helpers", () => {
  it("normalizes month start and detects single calendar month", () => {
    assert.equal(monthStartFromIsoDate("2026-07-29"), "2026-07-01");
    assert.equal(isSingleCalendarMonth("2026-07-01", "2026-07-29"), true);
    assert.equal(isSingleCalendarMonth("2026-07-01", "2026-08-01"), false);
  });

  it("maps progress tones and clamps Progress values", () => {
    assert.equal(targetProgressTone(null), "neutral");
    assert.equal(targetProgressTone(79.9), "destructive");
    assert.equal(targetProgressTone(80), "warning");
    assert.equal(targetProgressTone(100), "success");
    assert.equal(clampProgressValue(150), 100);
    assert.equal(clampProgressValue(-5), 0);
  });

  it("scales the progress track for markers above 100%", () => {
    assert.equal(progressTrackScale(90, [80, 100]), 100);
    assert.equal(progressTrackScale(120, [80, 110]), 120);
    assert.equal(progressTrackPosition(50, 100), 50);
    assert.equal(progressTrackPosition(110, 110), 100);
    assert.equal(progressTrackPosition(55, 110), 50);
  });

  it("builds linear monthly pace without inventing 0% when target missing", () => {
    assert.equal(daysInMonthFromStart("2026-07-01"), 31);
    assert.equal(paceTargetAmount(310_000, 10, 31), 100_000);
    assert.equal(paceTargetAmount(0, 10, 31), 0);
  });

  it("previews progress against the edited target without inventing loaded revenue", () => {
    assert.deepEqual(previewTargetProgress(400_000, 1_000_000), {
      progressPct: 40,
      gapAmount: 600_000,
    });
    assert.equal(previewTargetProgress(null, 1_000_000), null);
  });

  it("normalizes fixed and revenue-percent reward tiers", () => {
    assert.deepEqual(
      normalizeRevenueRewardTiers([
        {
          thresholdPct: 110,
          rewardType: "revenue_percent",
          rewardValue: 2.5,
        },
        { thresholdPct: 80, rewardType: "fixed_amount", rewardValue: 500_000 },
        {
          thresholdPct: 90,
          rewardType: "fixed_amount",
          rewardValue: 1_000_000,
        },
      ]),
      [
        { thresholdPct: 80, rewardType: "fixed_amount", rewardValue: 500_000 },
        {
          thresholdPct: 90,
          rewardType: "fixed_amount",
          rewardValue: 1_000_000,
        },
        {
          thresholdPct: 110,
          rewardType: "revenue_percent",
          rewardValue: 2.5,
        },
      ],
    );
    assert.equal(
      normalizeRevenueRewardTiers([
        { thresholdPct: 80, rewardType: "fixed_amount", rewardValue: 500_000 },
        { thresholdPct: 80, rewardType: "fixed_amount", rewardValue: 700_000 },
      ]),
      null,
    );
  });

  it("marks reward tiers achieved at or above the progress threshold", () => {
    assert.equal(isRevenueRewardTierAchieved(80, 80), true);
    assert.equal(isRevenueRewardTierAchieved(79.9, 80), false);
    assert.equal(isRevenueRewardTierAchieved(null, 80), false);
  });

  it("computes remaining net revenue to the next reward or 100% target mốc", () => {
    const tiers = [
      { thresholdPct: 80, rewardType: "fixed_amount" as const, rewardValue: 500_000 },
      { thresholdPct: 100, rewardType: "fixed_amount" as const, rewardValue: 1_000_000 },
    ];
    assert.deepEqual(nextRevenueRewardGap(700_000, 1_000_000, tiers), {
      thresholdPct: 80,
      gapAmount: 100_000,
    });
    assert.deepEqual(nextRevenueRewardGap(850_000, 1_000_000, tiers), {
      thresholdPct: 100,
      gapAmount: 150_000,
    });
    assert.equal(nextRevenueRewardGap(1_000_000, 1_000_000, tiers), null);
    assert.equal(nextRevenueRewardGap(400_000, null, tiers), null);
  });
});
