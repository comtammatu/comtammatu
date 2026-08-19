import assert from "node:assert/strict";
import { test } from "node:test";
import {
  listUpcomingScheduleShifts,
  mergeScheduleAttendanceWithAssignments,
} from "../lib/staff-runtime/_lib/schedule-month";
import type { ScheduleAttendance } from "../lib/staff-runtime/schedule/actions";

test("merge adds rostered shifts that have not been punched", () => {
  const attendance: ScheduleAttendance[] = [
    {
      date: "2026-08-19",
      check_in: "2026-08-19T01:05:00.000Z",
      check_out: "2026-08-19T08:00:00.000Z",
      scheduled_start_at: "2026-08-19T01:00:00.000Z",
      scheduled_end_at: "2026-08-19T08:00:00.000Z",
      status: "present",
      shift_name: "Ca sáng",
      start_time: "08:00:00",
      end_time: "16:00:00",
    },
  ];
  const merged = mergeScheduleAttendanceWithAssignments(attendance, [
    {
      workDate: "2026-08-19",
      shiftId: 1,
      shiftName: "Ca sáng",
      startTime: "08:00:00",
      endTime: "16:00:00",
    },
    {
      workDate: "2026-08-20",
      shiftId: 2,
      shiftName: "Ca chiều",
      startTime: "15:00:00",
      endTime: "22:00:00",
    },
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[1]?.status, "scheduled");
  assert.equal(merged[1]?.shift_name, "Ca chiều");
  assert.equal(merged[1]?.check_in, null);
});

test("upcoming list only includes future scheduled shifts", () => {
  const rows: ScheduleAttendance[] = [
    {
      date: "2026-08-19",
      check_in: null,
      check_out: null,
      scheduled_start_at: null,
      scheduled_end_at: null,
      status: "scheduled",
      shift_name: "Ca chiều",
      start_time: "15:00:00",
      end_time: "22:00:00",
    },
    {
      date: "2026-08-28",
      check_in: null,
      check_out: null,
      scheduled_start_at: null,
      scheduled_end_at: null,
      status: "scheduled",
      shift_name: "Ca sáng",
      start_time: "08:00:00",
      end_time: "16:00:00",
    },
  ];
  const upcoming = listUpcomingScheduleShifts(rows, "2026-08-19", 7);
  assert.equal(upcoming.length, 1);
  assert.equal(upcoming[0]?.shift_name, "Ca chiều");
});
