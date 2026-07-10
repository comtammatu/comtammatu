import assert from "node:assert/strict";
import test from "node:test";
import { datetime, duration, fmtInt, fmtMoney, hhmm } from "../format";

test("print values use the shared vi-VN number contract", () => {
  assert.equal(fmtInt(1_234), "1.234");
  assert.equal(fmtMoney(45_000), "45.000đ");
});

test("print timestamps preserve no-offset receipt wall-clock time in Vietnam", () => {
  assert.equal(hhmm("2026-05-05T08:00:00"), "08:00");
  assert.equal(datetime("2026-05-05T08:00:00"), "08:00 05/05/2026");
  assert.equal(
    datetime("2026-05-05T01:00:00Z"),
    "08:00 05/05/2026",
  );
  assert.equal(
    duration("2026-05-05T08:00:00", "2026-05-05T02:00:00Z"),
    "1 giờ",
  );
});
