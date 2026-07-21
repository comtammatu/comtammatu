import assert from "node:assert/strict";
import { test } from "node:test";
import { expandLeaveRangesByDate } from "../leave-calendar";

test("approved leave takes precedence over pending leave for the same day", () => {
  const leaveByDate = expandLeaveRangesByDate(
    [
      { startDate: "2026-02-11", endDate: "2026-02-13", status: "pending" },
      { startDate: "2026-02-12", endDate: "2026-02-14", status: "approved" },
    ],
    "2026-02-01",
    "2026-02-28",
  );

  assert.equal(leaveByDate.get("2026-02-11"), "pending");
  assert.equal(leaveByDate.get("2026-02-12"), "approved");
  assert.equal(leaveByDate.get("2026-02-14"), "approved");
});
