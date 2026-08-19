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

test("rejected checkout keeps shift tasks and count on the open punch", () => {
  const workday = readWeb("lib/staff-runtime/page.tsx");
  const workState = readWeb("lib/staff-runtime/_lib/today-work-state.ts");
  const countPage = readWeb("lib/staff-runtime/count/page.tsx");
  const tasksClient = readWeb("lib/staff-runtime/tasks/tasks-client.tsx");
  const messages = readWeb("lib/messages/employee.ts");
  const operator = readWeb("lib/messages/operator.ts");

  assert.match(
    workday,
    /tasksActive =[\s\S]*state\.status === "working";/,
    "Ca stepper must keep Việc trong ca while the punch is still working",
  );
  assert.doesNotMatch(
    workday,
    /tasksActive =[\s\S]*!requiredTasksDone/,
    "Completed required rows must not hide the task step after a checkout reject",
  );
  assert.match(
    workday,
    /state\.attendance\?\.shiftId \?\?/,
    "Embedded count must follow the open attendance shift, not the next clock window",
  );
  assert.match(workday, /checkoutRejectedTitle/);
  assert.match(workState, /checkout_approval_note/);
  assert.match(
    workState,
    /const currentShiftId = record\?\.shift_id \?\? assignedShift\?\.shiftId \?\? null/,
  );
  assert.match(
    countPage,
    /\.is\("check_out", null\)[\s\S]*\.not\("check_in", "is", null\)/,
    "Standalone count must prefer the open punch before wall-clock default shift",
  );
  assert.match(tasksClient, /item\.done \? taskCopy\.retakePhoto : taskCopy\.attachPhoto/);
  assert.match(messages, /checkoutRejectedTitle:/);
  assert.match(operator, /checkoutRejectedTitle:/);
});

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
  const rpcMigration = readRepo(
    "supabase/migrations/20260817141000_shift_task_photo_required.sql",
  );
  const compactMigration = readRepo(
    "supabase/migrations/20260817191830_compact_position_shift_tasks_photo_required.sql",
  );
  const messages = readWeb("lib/messages/employee.ts");
  const hr = readWeb("lib/messages/hr.ts");

  assert.match(tasksClient, /TaskPhotoSheet/);
  assert.match(tasksClient, /useLiveCamera\("environment"\)/);
  assert.match(tasksClient, /done && item\.allowsPhoto && !item\.photoPath/);
  assert.match(tasksClient, /isRequiredChecklistItemComplete/);
  assert.match(tasksClient, /phaseHints/);
  assert.match(actions, /photo_required/);
  assert.match(rpcMigration, /RAISE EXCEPTION 'photo_required'/);
  assert.match(rpcMigration, /is_done = true/);
  assert.match(
    compactMigration,
    /attendance_checklist_items_photo_required_when_done/,
  );
  assert.match(messages, /photoRequired:/);
  assert.match(hr, /Bắt buộc ảnh minh chứng/);
  assert.doesNotMatch(messages, /photoOptionalHint/);

  const workState = readWeb("lib/staff-runtime/_lib/today-work-state.ts");
  const workday = readWeb("lib/staff-runtime/page.tsx");
  const completeHelper = readWeb("lib/staff-runtime/_lib/checklist-complete.ts");
  assert.match(completeHelper, /item\.allowsPhoto/);
  assert.match(completeHelper, /item\.photoPath\?\.trim\(\)/);
  assert.match(workState, /isRequiredChecklistItemComplete\(item\)/);
  assert.match(
    workday,
    /function canRequestCheckout[\s\S]*requiredRemaining === 0/,
  );
});

test("floor shift tasks stay compact and waiter cannot close cash", () => {
  const migration = readRepo(
    "supabase/migrations/20260817191830_compact_position_shift_tasks_photo_required.sql",
  );
  const docs = readRepo("docs/ref/branch-operations.md");

  assert.match(migration, /\('cashier', 'end_of_shift', 'Đếm tiền, chốt ca POS'/);
  assert.match(
    migration,
    /\('waiter', 'end_of_shift', 'Dọn sảnh, quầy nước'/,
  );
  assert.match(
    migration,
    /\('waiter', 'end_of_shift', 'Dọn khu phụ trách', 'Chụp ảnh khu vực phụ trách đã dọn\.', 4, true\)/,
  );
  assert.doesNotMatch(
    migration,
    /\('waiter', 'end_of_shift', 'Đếm tiền/,
    "Waiter must not close POS cash",
  );
  assert.doesNotMatch(
    migration,
    /'Chấm công'/,
    "Clock-in is a system event, not a checklist row",
  );
  assert.match(docs, /dọn khu phụ trách \(ảnh\)/);
  assert.match(docs, /Không chốt ca\/void/);
});
