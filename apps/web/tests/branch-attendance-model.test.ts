import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildBranchAttendanceMonthSummary,
  filterAttendanceByEmployee,
  type BranchAttendanceRecord,
} from "../lib/hr/branch-attendance-model";

function record(
  partial: Partial<BranchAttendanceRecord> &
    Pick<BranchAttendanceRecord, "id" | "employee_id" | "date">,
): BranchAttendanceRecord {
  return {
    branch_id: 1,
    check_in: null,
    check_out: null,
    scheduled_start_at: null,
    scheduled_end_at: null,
    check_in_photo_path: null,
    status: "present",
    note: null,
    checklist_template_id: null,
    employees: {
      id: partial.employee_id,
      employee_code: `E${partial.employee_id}`,
      profiles: { full_name: `NV ${partial.employee_id}` },
    },
    shifts: { name: "Hành chính", start_time: "08:00", end_time: "17:00" },
    shift_checklist_templates: null,
    attendance_checklist_items: [],
    ...partial,
  };
}

test("buildBranchAttendanceMonthSummary counts closed and open shifts", () => {
  const rows = buildBranchAttendanceMonthSummary([
    record({
      id: 1,
      employee_id: 10,
      date: "2026-08-01",
      check_in: "2026-08-01T01:00:00.000Z",
      check_out: "2026-08-01T09:00:00.000Z",
    }),
    record({
      id: 2,
      employee_id: 10,
      date: "2026-08-02",
      check_in: "2026-08-02T01:00:00.000Z",
      check_out: null,
    }),
    record({
      id: 3,
      employee_id: 11,
      date: "2026-08-01",
      check_in: "2026-08-01T02:00:00.000Z",
      check_out: "2026-08-01T06:00:00.000Z",
    }),
  ]);

  assert.equal(rows.length, 2);
  const first = rows.find((row) => row.employee_id === 10);
  const second = rows.find((row) => row.employee_id === 11);
  assert.ok(first);
  assert.ok(second);
  assert.equal(first.closedShifts, 1);
  assert.equal(first.openShifts, 1);
  assert.equal(first.work_hours, 8);
  assert.equal(first.workdays, 0);
  assert.equal(second.closedShifts, 1);
  assert.equal(second.openShifts, 0);
  assert.equal(second.work_hours, 4);
  assert.equal(second.workdays, 0);
});

test("buildBranchAttendanceMonthSummary uses hour-ratio when frozen window exists", () => {
  const rows = buildBranchAttendanceMonthSummary([
    record({
      id: 1,
      employee_id: 10,
      date: "2026-08-01",
      check_in: "2026-08-01T01:00:00.000Z",
      check_out: "2026-08-01T09:00:00.000Z",
      scheduled_start_at: "2026-08-01T01:00:00.000Z",
      scheduled_end_at: "2026-08-01T09:00:00.000Z",
    }),
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.workdays, 1);
});

test("filterAttendanceByEmployee sorts newest first", () => {
  const filtered = filterAttendanceByEmployee(
    [
      record({
        id: 1,
        employee_id: 10,
        date: "2026-08-01",
        check_in: "2026-08-01T01:00:00.000Z",
      }),
      record({
        id: 2,
        employee_id: 11,
        date: "2026-08-03",
        check_in: "2026-08-03T01:00:00.000Z",
      }),
      record({
        id: 3,
        employee_id: 10,
        date: "2026-08-08",
        check_in: "2026-08-08T01:00:00.000Z",
      }),
    ],
    10,
  );

  assert.deepEqual(
    filtered.map((row) => row.id),
    [3, 1],
  );
});
