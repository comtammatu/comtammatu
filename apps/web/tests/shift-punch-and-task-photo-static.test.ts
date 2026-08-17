import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), "../..", path), "utf8");
}

test("clock-in captures and submits in one tap", () => {
  const clockClient = readWeb("lib/staff-runtime/clock/clock-client.tsx");
  assert.match(clockClient, /punchFromCamera/);
  assert.match(clockClient, /completeClockIn\(captured\)/);
  assert.match(clockClient, /surface\?: "page" \| "embedded"/);
  assert.doesNotMatch(
    clockClient,
    /clockCopy\.capturePhoto/,
    "Clock-in must not keep a separate capture-then-confirm step",
  );
});

test("branch workday embeds punch and checkout on Ca hôm nay", () => {
  const workday = readWeb("lib/staff-runtime/page.tsx");
  assert.match(workday, /surface="embedded"/);
  assert.match(
    workday,
    /content: hasClockedIn[\s\S]*<ClockClient/,
    "Clock-in camera should render on the workday stepper",
  );
  assert.match(
    workday,
    /checkoutActive \? \(\s*<ClockClient/,
    "Checkout should submit from the workday stepper, not a second page hop",
  );
});

test("shift task photo is required to mark done", () => {
  const tasksClient = readWeb("lib/staff-runtime/tasks/tasks-client.tsx");
  const actions = readWeb("lib/staff-runtime/clock/actions.ts");
  const migration = readRepo(
    "supabase/migrations/20260817141000_shift_task_photo_required.sql",
  );
  const messages = readWeb("lib/messages/employee.ts");
  const hr = readWeb("lib/messages/hr.ts");

  assert.match(tasksClient, /TaskPhotoSheet/);
  assert.match(tasksClient, /useLiveCamera\("environment"\)/);
  assert.match(tasksClient, /done && item\.allowsPhoto && !item\.photoPath/);
  assert.match(tasksClient, /phaseHints/);
  assert.match(actions, /photo_required/);
  assert.match(migration, /RAISE EXCEPTION 'photo_required'/);
  assert.match(migration, /is_done = true/);
  assert.match(messages, /photoRequired:/);
  assert.match(hr, /Bắt buộc ảnh minh chứng/);
  assert.doesNotMatch(messages, /photoOptionalHint/);
});
