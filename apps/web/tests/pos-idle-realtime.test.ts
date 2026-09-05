import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isClosedPosSessionUpdate,
  isCurrentDailyLimitRealtimeEvent,
} from "../app/(protected)/br/[branchId]/pos/_lib/pos-idle-realtime";

test("daily-limit realtime ignores rows outside today's HCM date", () => {
  const today = "2026-09-05";
  assert.equal(
    isCurrentDailyLimitRealtimeEvent(
      "UPDATE",
      { old: { limit_date: today }, new: { limit_date: today } },
      today,
    ),
    true,
  );
  assert.equal(
    isCurrentDailyLimitRealtimeEvent(
      "UPDATE",
      { old: { limit_date: "2026-09-04" }, new: { limit_date: "2026-09-04" } },
      today,
    ),
    false,
  );
  assert.equal(
    isCurrentDailyLimitRealtimeEvent(
      "DELETE",
      { old: { limit_date: "2026-09-04" }, new: {} },
      today,
    ),
    false,
  );
});

test("session-close realtime matches only this terminal's closed row", () => {
  assert.equal(
    isClosedPosSessionUpdate({ id: 42, status: "closed" }, 42),
    true,
  );
  assert.equal(
    isClosedPosSessionUpdate({ id: 42, status: "open" }, 42),
    false,
  );
  assert.equal(
    isClosedPosSessionUpdate({ id: 99, status: "closed" }, 42),
    false,
  );
});
