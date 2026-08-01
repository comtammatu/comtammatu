import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  clampProgressValue,
  daysInMonthFromStart,
  isSingleCalendarMonth,
  isRevenueRewardTierAchieved,
  monthStartFromIsoDate,
  normalizeRevenueRewardTiers,
  paceTargetAmount,
  previewTargetProgress,
  targetProgressTone,
} from "../app/(protected)/finance/_lib/revenue-target";

const readWeb = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8");
const readRepo = (path: string) =>
  readFileSync(join(process.cwd(), "../..", path), "utf8");

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

  it("marks each reward tier independently from current progress", () => {
    assert.equal(isRevenueRewardTierAchieved(89.9, 90), false);
    assert.equal(isRevenueRewardTierAchieved(90, 90), true);
    assert.equal(isRevenueRewardTierAchieved(110, 100), true);
    assert.equal(isRevenueRewardTierAchieved(null, 80), false);
  });

  it("loads and renders every assigned-branch reward tier", () => {
    const actions = readWeb("app/(protected)/finance/targets/actions.ts");
    const strip = readWeb(
      "app/(protected)/br/[branchId]/(operator)/_components/home/branch-revenue-target-strip.tsx",
    );
    const migration = readRepo(
      "supabase/migrations/20260801120400_allow_branch_manager_reward_tier_read.sql",
    );

    assert.match(actions, /list_branch_revenue_target_reward_tiers/);
    assert.match(actions, /rewardTiers,/);
    assert.match(strip, /progress\.rewardTiers\.map/);
    assert.match(migration, /targets\.branch_id = v_branch/);
    assert.match(migration, /v_role = 'branch_manager'/);
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
});
