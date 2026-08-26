import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("Ca copy names the assigned shift wait, not a missing roster", () => {
  const employee = readWeb("lib/messages/employee.ts");
  const operator = readWeb("lib/messages/operator.ts");
  const clockClient = readWeb("lib/staff-runtime/clock/clock-client.tsx");
  const workday = readWeb("lib/staff-runtime/page.tsx");
  const gate = readWeb("lib/staff-runtime/_lib/default-shift.ts");

  assert.match(gate, /CLOCK_IN_EARLY_MINUTES = 60/);
  assert.match(gate, /kind: "too_early"/);
  assert.match(employee, /statusClockInTooEarly: "Chưa đến giờ chấm công"/);
  assert.match(employee, /Bạn có thể chấm công từ/);
  assert.match(operator, /statusClockInTooEarly: "Chưa đến giờ chấm công"/);
  assert.match(clockClient, /getClockInBlockedMessage/);
  assert.match(workday, /isClockInBlocked\(state\)/);
  assert.doesNotMatch(
    workday,
    /status === "not_started" && state\.shiftUnassigned[\s\S]*descriptionShiftUnassigned/,
  );
});

test("Kết ca waits for manager; leftover pending auto-closes after 2 hours", () => {
  const actions = readWeb("lib/staff-runtime/clock/actions.ts");
  const worker = readWeb("lib/staff-runtime/_lib/checkout-auto-approve.ts");
  const route = readWeb(
    "app/api/cron/attendance-checkout-auto-approve/route.ts",
  );
  const vercel = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
  const employee = readWeb("lib/messages/employee.ts");
  const operator = readWeb("lib/messages/operator.ts");
  const clockClient = readWeb("lib/staff-runtime/clock/clock-client.tsx");

  assert.match(actions, /self_service_request_checkout/);
  assert.doesNotMatch(actions, /Tự động duyệt kết ca/);
  assert.match(worker, /CHECKOUT_AUTO_APPROVE_AFTER_HOURS = 2/);
  assert.match(worker, /Tự động duyệt kết ca/);
  assert.match(route, /autoApproveStaleCheckouts/);
  assert.match(vercel, /\/api\/cron\/attendance-checkout-auto-approve/);
  assert.doesNotMatch(employee, /tự duyệt sau 2 giờ/);
  assert.doesNotMatch(operator, /tự duyệt sau 2 giờ/);
  assert.doesNotMatch(clockClient, /checkoutPendingAutoApproveHint/);
});

test("Lịch merges rostered shifts onto calendar days, not a side list", () => {
  const data = readWeb("lib/staff-runtime/schedule/data.ts");
  const client = readWeb("lib/staff-runtime/schedule/schedule-client.tsx");
  const messages = readWeb("lib/messages/employee.ts");
  assert.match(data, /from\("shift_assignments"\)/);
  assert.match(data, /mergeScheduleAttendanceWithAssignments/);
  assert.match(client, /att\.shift_name \?\? copy\.rowShift/);
  assert.doesNotMatch(client, /listUpcomingScheduleShifts/);
  assert.doesNotMatch(client, /upcomingTitle/);
  assert.doesNotMatch(messages, /upcomingTitle/);
  assert.match(messages, /scheduledShift: "Đã xếp ca"/);
});
