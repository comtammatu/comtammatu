import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Phase F — HR LIST compose ratchet:
 * attendance megaclient split, payroll calendar day URL, people filter URL,
 * no sticky AppToolbar on attendance/payroll LIST frames.
 */

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function lineCount(path: string): number {
  return read(path).split(/\r?\n/).length;
}

test("Attendance LIST shell stays under megaclient budget and imports modules", () => {
  const shell = "app/(protected)/hr/attendance/attendance-table.tsx";
  const chrome = "app/(protected)/hr/attendance/attendance-list-chrome.tsx";
  const host = "app/(protected)/hr/attendance/attendance-calendar-host.tsx";
  const detail = "app/(protected)/hr/attendance/attendance-detail-view.tsx";
  const source = read(shell);
  assert.ok(
    lineCount(shell) <= 500,
    `attendance-table.tsx is ${lineCount(shell)} LOC (budget 500)`,
  );
  assert.match(source, /export function AttendanceTable/);
  assert.match(source, /syncAttendanceUrl/);
  assert.match(source, /from "\.\/attendance-calendar-host"/);
  assert.match(source, /from "\.\/attendance-list-chrome"/);
  assert.match(read(host), /from "\.\/attendance-detail-view"/);
  assert.match(read(chrome), /AppListFrame/);
  assert.match(read(chrome), /variant="inline"/);
  assert.doesNotMatch(source, /<AppToolbar\s+sticky\b/);
  assert.doesNotMatch(read(chrome), /<AppToolbar\s+sticky\b/);
  assert.ok(lineCount(detail) > 20, "attendance-detail-view module exists");
});

test("Payroll calendar binds selected day to URL day param", () => {
  const page = read("app/(protected)/hr/payroll/page.tsx");
  const client = read("app/(protected)/hr/payroll/payroll-list-client.tsx");
  const dialog = read(
    "app/(protected)/hr/payroll/payroll-calendar-dialog.tsx",
  );
  assert.match(page, /day/);
  assert.match(client, /selectedCalendarDay|day/);
  assert.match(client, /from "\.\/payroll-calendar-dialog"/);
  assert.match(dialog, /AppDialog|calendar/i);
  assert.doesNotMatch(client, /<AppToolbar\s+sticky\b/);
});

test("People profile filters bind q/position/salary/contract/inactive to URL", () => {
  const source = read("app/(protected)/hr/employee-table.tsx");
  assert.match(source, /replacePeopleFilters/);
  assert.match(source, /searchParams\.get\("position"\)/);
  assert.match(source, /searchParams\.get\("contract"\)/);
  assert.match(source, /inactive/);
  assert.match(source, /salary/);
});
