import test from "node:test";
import assert from "node:assert/strict";
import {
  addVNDateDays,
  diffVNDateDays,
  formatVNBusinessDate,
  getVNDateString,
  getVNDateStringDaysAgo,
  getVNDayUtcRange,
  getVNMonthEndDateString,
  getVNMonthSequenceBack,
  getVNWeekEndDateString,
  getVNWeekStartDateString,
  getYesterdayVNDateString,
} from "../vietnam";

test("VN date string flips at 17:00 UTC", () => {
  assert.equal(getVNDateString("2026-05-22T16:59:59Z"), "2026-05-22");
  assert.equal(getVNDateString("2026-05-22T17:00:00Z"), "2026-05-23");
});

test("VN day UTC range uses exclusive next-day boundary", () => {
  assert.deepEqual(getVNDayUtcRange("2026-05-23"), {
    startIso: "2026-05-22T17:00:00.000Z",
    endIso: "2026-05-23T17:00:00.000Z",
  });
});

test("VN relative dates are calendar based", () => {
  assert.equal(addVNDateDays("2026-01-31", 1), "2026-02-01");
  assert.equal(getYesterdayVNDateString("2026-05-22T17:30:00Z"), "2026-05-22");
  assert.equal(getVNDateStringDaysAgo(7, "2026-05-23T02:00:00+07:00"), "2026-05-16");
});

test("VN month and week helpers handle boundaries", () => {
  assert.equal(getVNMonthEndDateString(2026, 2), "2026-02-28");
  assert.deepEqual(getVNMonthSequenceBack(3, "2026-01-05T01:00:00+07:00"), [
    { year: 2026, month: 1, date: "2026-01-01" },
    { year: 2025, month: 12, date: "2025-12-01" },
    { year: 2025, month: 11, date: "2025-11-01" },
  ]);
  assert.equal(getVNWeekStartDateString("2026-05-17T18:00:00Z"), "2026-05-18");
  assert.equal(getVNWeekEndDateString("2026-05-18"), "2026-05-24");
});

test("VN date-only helpers avoid runtime timezone", () => {
  assert.equal(formatVNBusinessDate("2026-05-23"), "23/05/2026");
  assert.equal(diffVNDateDays("2026-05-01", "2026-05-23"), 22);
});
