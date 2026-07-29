import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampProgressValue,
  daysInMonthFromStart,
  isSingleCalendarMonth,
  monthStartFromIsoDate,
  paceTargetAmount,
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

  it("builds linear monthly pace without inventing 0% when target missing", () => {
    assert.equal(daysInMonthFromStart("2026-07-01"), 31);
    assert.equal(paceTargetAmount(310_000, 10, 31), 100_000);
    assert.equal(paceTargetAmount(0, 10, 31), 0);
  });
});
