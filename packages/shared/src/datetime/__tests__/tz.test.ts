import test from "node:test";
import assert from "node:assert/strict";
import {
  formatDateTimeVN,
  formatTimeVN,
  todayInTz,
  startOfDayInTz,
  endOfDayInTz,
  getZonedParts,
} from "../index";

const TZ = "Asia/Ho_Chi_Minh"; // UTC+7, no DST

// 2026-04-30 07:00 UTC = 2026-04-30 14:00 ICT
const SAMPLE_UTC = "2026-04-30T07:00:00Z";

test("formatDateTimeVN renders Asia/Ho_Chi_Minh wall-clock regardless of host TZ", () => {
  assert.equal(formatDateTimeVN(SAMPLE_UTC, TZ), "30/04/2026 14:00");
});

test("formatTimeVN uses 24h cycle pinned by hourCycle h23", () => {
  // 18:00 UTC = 01:00 next day ICT — 24h format must show "01:00"
  assert.equal(formatTimeVN("2026-04-30T18:00:00Z", TZ), "01:00");
});

test("todayInTz returns ISO YYYY-MM-DD in tenant tz, not host tz", () => {
  // 2026-04-30 17:30 UTC = 2026-05-01 00:30 ICT (next business day)
  assert.equal(todayInTz(TZ, "2026-04-30T17:30:00Z"), "2026-05-01");
});

test("startOfDayInTz / endOfDayInTz produce a 24h window aligned to tenant midnight", () => {
  const anyInstantOnApr30Ict = "2026-04-30T17:30:00Z"; // ICT 2026-05-01 00:30
  const start = startOfDayInTz(anyInstantOnApr30Ict, TZ);
  const end = endOfDayInTz(anyInstantOnApr30Ict, TZ);

  // Start = 2026-05-01 00:00 ICT = 2026-04-30 17:00 UTC
  assert.equal(start.toISOString(), "2026-04-30T17:00:00.000Z");
  // End is exclusive: +24h
  assert.equal(end.getTime() - start.getTime(), 24 * 60 * 60 * 1000);
});

test("getZonedParts matches printed parts (no off-by-one near midnight)", () => {
  const parts = getZonedParts("2026-04-30T16:59:59Z", TZ); // ICT 2026-04-30 23:59:59
  assert.equal(parts.year, 2026);
  assert.equal(parts.month, 4);
  assert.equal(parts.day, 30);
  assert.equal(parts.hour, 23);
  assert.equal(parts.minute, 59);
  assert.equal(parts.second, 59);
});
