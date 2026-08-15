import test from "node:test";
import assert from "node:assert/strict";
import {
  addVNDateDays,
  diffVNDateDays,
  formatVNBusinessDate,
  formatVNClockTime,
  formatVNDate,
  formatVNDateTime,
  formatVNDayMonth,
  formatVNDuration,
  formatVNDurationMinutes,
  formatVNElapsedCompact,
  formatVNTime,
  formatVNWeekdayShort,
  getVNDateString,
  getVNDateStringDaysAgo,
  getVNDayUtcRange,
  getVNBusinessDateString,
  getVNBusinessDayUtcRange,
  getVNMonthCalendarCells,
  getVNMonthEndDateString,
  getVNMonthSequenceBack,
  getYesterdayVNDateString,
  getVNMinutesOfDay,
  parseClockTimeToMinutes,
  isWithinShiftWindow,
} from "../vietnam";

test("VN minutes-of-day reflects the +07:00 wall clock", () => {
  // 01:30 UTC → 08:30 VN → 510
  assert.equal(getVNMinutesOfDay("2026-05-22T01:30:00Z"), 510);
  // 17:00 UTC → 00:00 VN next day → 0 (normalises the "24" hour)
  assert.equal(getVNMinutesOfDay("2026-05-22T17:00:00Z"), 0);
});

test("parseClockTimeToMinutes parses HH:MM[:SS] and rejects junk", () => {
  assert.equal(parseClockTimeToMinutes("08:00"), 480);
  assert.equal(parseClockTimeToMinutes("18:30:00"), 1110);
  assert.equal(parseClockTimeToMinutes("00:00"), 0);
  assert.equal(parseClockTimeToMinutes("24:00"), null);
  assert.equal(parseClockTimeToMinutes("08:00junk"), null);
  assert.equal(parseClockTimeToMinutes("bad"), null);
});

test("VN display helpers pin timestamps and clock ranges to the contract", () => {
  const timestamp = "2026-05-22T01:30:45Z";
  assert.equal(formatVNDate(timestamp), "22/05/2026");
  assert.equal(formatVNDayMonth(timestamp), "22-05");
  assert.equal(formatVNWeekdayShort(timestamp), "Thứ 6");
  assert.equal(formatVNTime(timestamp), "08:30");
  assert.equal(formatVNDateTime(timestamp), "08:30 22/05/2026");
  assert.equal(formatVNClockTime("8:05:33"), "08:05");
  assert.equal(formatVNClockTime("08:60"), "—");
  assert.equal(formatVNDurationMinutes(65), "1 giờ 05 phút");
  assert.equal(
    formatVNDuration("2026-05-22T01:00:00Z", "2026-05-22T02:05:00Z"),
    "1 giờ 05 phút",
  );
  assert.equal(
    formatVNElapsedCompact("2026-05-22T01:00:00Z", "2026-05-22T01:00:30Z"),
    "Vừa xong",
  );
  assert.equal(
    formatVNElapsedCompact("2026-05-22T01:00:00Z", "2026-05-22T01:25:00Z"),
    "25p",
  );
  assert.equal(
    formatVNElapsedCompact("2026-05-22T01:00:00Z", "2026-05-22T02:15:00Z"),
    "1h 15p",
  );
  assert.equal(
    formatVNElapsedCompact("2026-05-22T01:00:00Z", "2026-05-22T03:00:00Z"),
    "2h",
  );
});

test("isWithinShiftWindow handles a same-day shift with grace", () => {
  const grace = 60; // shift 08:00–17:00
  assert.equal(isWithinShiftWindow(8 * 60, 480, 1020, grace), true);
  assert.equal(isWithinShiftWindow(7 * 60, 480, 1020, grace), true);
  assert.equal(isWithinShiftWindow(6 * 60 + 59, 480, 1020, grace), false);
  assert.equal(isWithinShiftWindow(18 * 60, 480, 1020, grace), true);
  assert.equal(isWithinShiftWindow(18 * 60 + 1, 480, 1020, grace), false);
});

test("isWithinShiftWindow wraps an overnight shift past midnight", () => {
  const grace = 60; // shift 18:00–02:00
  assert.equal(isWithinShiftWindow(18 * 60, 1080, 120, grace), true);
  assert.equal(isWithinShiftWindow(17 * 60, 1080, 120, grace), true);
  assert.equal(isWithinShiftWindow(0, 1080, 120, grace), true);
  assert.equal(isWithinShiftWindow(2 * 60 + 30, 1080, 120, grace), true);
  assert.equal(isWithinShiftWindow(3 * 60 + 1, 1080, 120, grace), false);
  assert.equal(isWithinShiftWindow(12 * 60, 1080, 120, grace), false);
});

test("isWithinShiftWindow keeps a near-midnight end reachable via grace wrap", () => {
  const grace = 60; // shift 23:00–23:30 → grace pushes end to 00:30 next day
  assert.equal(isWithinShiftWindow(0, 1380, 1410, grace), true);
  assert.equal(isWithinShiftWindow(10, 1380, 1410, grace), true);
  assert.equal(isWithinShiftWindow(7 * 60, 1380, 1410, grace), false);
});

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

test("VN business day uses 04:00 cut-off", () => {
  assert.equal(
    getVNBusinessDateString("2026-05-23T03:59:00+07:00"),
    "2026-05-22",
  );
  assert.equal(
    getVNBusinessDateString("2026-05-23T04:00:00+07:00"),
    "2026-05-23",
  );
  assert.deepEqual(getVNBusinessDayUtcRange("2026-05-23"), {
    startIso: "2026-05-22T21:00:00.000Z",
    endIso: "2026-05-23T21:00:00.000Z",
  });
});

test("VN relative dates are calendar based", () => {
  assert.equal(addVNDateDays("2026-01-31", 1), "2026-02-01");
  assert.equal(getYesterdayVNDateString("2026-05-22T17:30:00Z"), "2026-05-22");
  assert.equal(
    getVNDateStringDaysAgo(7, "2026-05-23T02:00:00+07:00"),
    "2026-05-16",
  );
});

test("VN month and week helpers handle boundaries", () => {
  assert.equal(getVNMonthEndDateString(2026, 2), "2026-02-28");
  assert.deepEqual(getVNMonthSequenceBack(3, "2026-01-05T01:00:00+07:00"), [
    { year: 2026, month: 1, date: "2026-01-01" },
    { year: 2025, month: 12, date: "2025-12-01" },
    { year: 2025, month: 11, date: "2025-11-01" },
  ]);
});

test("VN month calendar cells are Monday-first and preserve business dates", () => {
  const cells = getVNMonthCalendarCells("2026-02-01", "2026-02-14");

  assert.equal(cells.length, 35);
  assert.deepEqual(cells.slice(0, 6), Array(6).fill({
    date: null,
    day: null,
    isToday: false,
  }));
  assert.deepEqual(cells[6], {
    date: "2026-02-01",
    day: 1,
    isToday: false,
  });
  assert.deepEqual(cells[19], {
    date: "2026-02-14",
    day: 14,
    isToday: true,
  });
  assert.deepEqual(cells[33], {
    date: "2026-02-28",
    day: 28,
    isToday: false,
  });
});

test("VN date-only helpers avoid runtime timezone", () => {
  assert.equal(formatVNBusinessDate("2026-05-23"), "23/05/2026");
  assert.equal(diffVNDateDays("2026-05-01", "2026-05-23"), 22);
});
