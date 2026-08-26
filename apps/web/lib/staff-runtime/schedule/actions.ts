"use server";

import type { ActionResult } from "@comtammatu/shared/types";
import { getEmployeeContext } from "../_lib/staff-runtime-context";
import { loadScheduleMonth, type ScheduleMonthData } from "./data";

export type {
  ScheduleAnnualLeaveBalance,
  ScheduleAttendance,
  ScheduleLeave,
  ScheduleMonthData,
  ScheduleMonthlyLeaveBalance,
} from "./data";

export async function fetchMySchedule(
  monthStartDate: string,
): Promise<ActionResult<ScheduleMonthData>> {
  const ctx = await getEmployeeContext();
  if (!ctx) {
    return { success: false, error: "Không tìm thấy hồ sơ nhân viên" };
  }

  return loadScheduleMonth(ctx, monthStartDate);
}
