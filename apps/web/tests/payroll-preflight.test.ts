import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPayrollPreflight,
  isStaleOpenPayrollAttendance,
} from "../lib/hr/payroll-preflight";

test("payroll preflight groups every blocking state by its branch", () => {
  const preflight = buildPayrollPreflight({
    employees: [
      { employeeId: 1, branchId: 10, branchName: "Quận 1" },
      { employeeId: 2, branchId: 20, branchName: "Phú Nhuận" },
      { employeeId: 3, branchId: 20, branchName: "Phú Nhuận" },
    ],
    missingSalaryEmployeeIds: [1],
    openAttendance: [
      {
        employeeId: 2,
        date: "2026-07-19",
        checkIn: "2026-07-19T02:00:00.000Z",
        checkOut: null,
        shiftStartTime: null,
        shiftEndTime: null,
      },
    ],
    pendingLeaveEmployeeIds: [2, 3],
  });

  assert.deepEqual(preflight.blockers, [
    {
      kind: "missing_salary",
      count: 1,
      branchId: 10,
      branchName: "Quận 1",
    },
    {
      kind: "stale_open_attendance",
      count: 1,
      branchId: 20,
      branchName: "Phú Nhuận",
    },
    {
      kind: "pending_leave",
      count: 2,
      branchId: 20,
      branchName: "Phú Nhuận",
    },
  ]);
});

test("payroll preflight only blocks an open shift after its business end", () => {
  const attendance = {
    employeeId: 1,
    date: "2026-07-20",
    checkIn: "2026-07-20T02:00:00.000Z",
    checkOut: null,
    shiftStartTime: "08:00",
    shiftEndTime: "17:00",
  };

  assert.equal(
    isStaleOpenPayrollAttendance(attendance, {
      calendarDate: "2026-07-20",
      nowMinutes: 16 * 60,
    }),
    false,
  );
  assert.equal(
    isStaleOpenPayrollAttendance(attendance, {
      calendarDate: "2026-07-20",
      nowMinutes: 17 * 60,
    }),
    true,
  );
});
