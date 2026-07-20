import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateAttendanceWorkHours } from "../app/(protected)/hr/attendance-summary";

test("attendance work hours include only valid closed shifts", () => {
  assert.equal(
    calculateAttendanceWorkHours(
      "2026-07-20T01:00:00.000Z",
      "2026-07-20T09:30:00.000Z",
    ),
    8.5,
  );
  assert.equal(
    calculateAttendanceWorkHours("2026-07-20T01:00:00.000Z", null),
    0,
  );
  assert.equal(
    calculateAttendanceWorkHours(
      "2026-07-20T09:30:00.000Z",
      "2026-07-20T01:00:00.000Z",
    ),
    0,
  );
});
