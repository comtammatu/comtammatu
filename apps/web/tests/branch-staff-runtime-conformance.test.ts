import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("..", import.meta.url));

function read(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

test("BranchTodayStatus includes a 1-tap 48px checkout CTA when ready to checkout", () => {
  const file = read(
    "app/(protected)/br/[branchId]/(operator)/_components/home/branch-today-status.tsx",
  );

  assert.match(
    file,
    /IconLogOut/,
    "BranchTodayStatus must import IconLogOut",
  );
  assert.match(
    file,
    /isReadyToCheckout[\s\S]*?copy\.clockOut/,
    "BranchTodayStatus must provide clockOut button when ready to checkout",
  );
  assert.match(
    file,
    /isReadyToCheckout\s*\?\s*\(\s*<Button[\s\S]*?size="touch"/,
    "BranchTodayStatus clockOut button must satisfy 48px touch standard",
  );
});

test("Staff runtime shift page configures responsive personal shortcuts and blocked tasks", () => {
  const page = read("lib/staff-runtime/page.tsx");

  // Personal shortcuts multi-column configuration
  assert.match(
    page,
    /personalShortcutsSection\s*=\s*\([\s\S]*?columns=\{2\}[\s\S]*?wideColumns/,
    "Personal shortcuts section must configure 2 columns with wideColumns expansion",
  );

  // Incomplete required checklist items responsive grid and touch targets
  assert.match(
    page,
    /incompleteRequiredItems\.map[\s\S]*?min-h-12 touch-manipulation/,
    "Blocked checklist items must enforce 48px touch target and touch-manipulation",
  );
  assert.match(
    page,
    /<ItemGroup\s+className="gap-1\.5\s+sm:grid\s+sm:grid-cols-2"/,
    "Blocked checklist items must densify into 2-column grid on sm+",
  );
});

test("Shift task checklist preserves single-column readability and universal 48px touch targets", () => {
  const tasks = read("lib/staff-runtime/tasks/tasks-client.tsx");

  assert.match(
    tasks,
    /<ItemGroup\s+className="gap-2"/,
    "Tasks checklist must stay single-column for copy readability",
  );
  assert.match(
    tasks,
    /min-h-12 touch-manipulation/,
    "Task items must enforce 48px touch height and touch manipulation",
  );
  assert.doesNotMatch(
    tasks,
    /<Button[^>]*size="sm"[^>]*>\s*\{item\.title\}\s*<\/Button>/,
    "Task title button must not downgrade touch target to size='sm'",
  );
});

test("Inventory count client preserves single-column list with 56px touch items for phone readability", () => {
  const count = read("lib/staff-runtime/count/count-client.tsx");

  assert.match(
    count,
    /<ItemGroup\s+className="gap-2"/,
    "Count items must render as a single-column list",
  );
  assert.match(
    count,
    /min-h-14 touch-manipulation/,
    "Count items must provide 56px touch target (min-h-14)",
  );
});

test("Schedule day detail displays attendance in a responsive 2-column grid", () => {
  const schedule = read("lib/staff-runtime/schedule/schedule-client.tsx");

  assert.match(
    schedule,
    /<div\s+className="grid\s+gap-2\s+sm:grid-cols-2"/,
    "Selected day attendances must render in a 2-column grid on sm+",
  );
});

test("Leave request client uses multi-column grid with 56px touch targets", () => {
  const leave = read("lib/staff-runtime/leave/leave-client.tsx");

  assert.match(
    leave,
    /<ItemGroup\s+className="grid\s+gap-2\s+sm:grid-cols-2\s+lg:grid-cols-2\s+xl:grid-cols-3"/,
    "Leave request items must use responsive 2-3 column grid",
  );
  assert.match(
    leave,
    /min-h-14 touch-manipulation/,
    "Leave request items must enforce 56px touch target",
  );
});

test("Branch profile uses wide columns for personal tools", () => {
  const profile = read("lib/staff-runtime/profile/page.tsx");

  assert.match(
    profile,
    /<BranchOperatorActionSection[\s\S]*?columns=\{2\}[\s\S]*?wideColumns[\s\S]*?links=\{personalToolsLinks\}/,
    "Branch profile personal tools section must enable wideColumns",
  );
});

test("Payslip client organizes slips in a 2-column card grid and balances detail rows", () => {
  const payslip = read("lib/staff-runtime/payslip/payslip-client.tsx");

  assert.match(
    payslip,
    /<div\s+className="grid\s+gap-3\s+lg:grid-cols-2"/,
    "Payslip cards must arrange into 2-column grid on desktop",
  );
  assert.match(
    payslip,
    /<DetailList\s+columns=\{2\}/,
    "Payslip detail list must balance metrics in 2 columns",
  );
});

test("Branch team members client adopts 2-3 column responsive grid", () => {
  const members = read(
    "app/(protected)/br/[branchId]/(operator)/team/members/members-client.tsx",
  );

  const matches = members.match(
    /<div\s+className="grid\s+gap-2\s+lg:grid-cols-2\s+sm:grid-cols-2\s+xl:grid-cols-3"/g,
  );
  assert.ok(matches && matches.length >= 2, "Both grouped and flat member lists must use responsive 2-3 column grid");
});
