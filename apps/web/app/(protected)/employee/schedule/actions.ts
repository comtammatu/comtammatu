"use server";

import { z } from "zod";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaimsFromAccessToken } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  getVNMonthEndDateString,
  parseISODateParts,
} from "@comtammatu/shared/time";

const monthStartSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Ngày không hợp lệ (YYYY-MM-DD)" });

export interface ScheduleShift {
  date: string;
  shift_name: string;
  start_time: string;
  end_time: string;
}

export interface ScheduleAttendance {
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
}

export interface ScheduleMonthData {
  shifts: ScheduleShift[];
  attendance: ScheduleAttendance[];
}

export async function fetchMySchedule(
  monthStartDate: string,
): Promise<ActionResult<ScheduleMonthData>> {
  const parsed = monthStartSchema.safeParse(monthStartDate);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ngày không hợp lệ",
    };
  }

  const monthParts = parseISODateParts(parsed.data);
  if (!monthParts || monthParts.day !== 1) {
    return { success: false, error: "Tháng không hợp lệ" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Chưa đăng nhập" };

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = extractClaimsFromAccessToken(session?.access_token);
  if (!claims) return { success: false, error: "Không có quyền" };

  // Find employee record for current user
  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", user.id)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!employee) {
    return { success: false, error: "Không tìm thấy hồ sơ nhân viên" };
  }

  const monthEndDate = getVNMonthEndDateString(
    monthParts.year,
    monthParts.month,
  );

  const [shiftResult, attendanceResult] = await Promise.all([
    supabase
      .from("shift_assignments")
      .select("date, shifts ( name, start_time, end_time )")
      .eq("employee_id", employee.id)
      .eq("tenant_id", claims.tenant_id)
      .gte("date", parsed.data)
      .lte("date", monthEndDate)
      .order("date"),
    supabase
      .from("attendance_records")
      .select("date, check_in, check_out, status")
      .eq("employee_id", employee.id)
      .eq("tenant_id", claims.tenant_id)
      .gte("date", parsed.data)
      .lte("date", monthEndDate)
      .order("date"),
  ]);

  if (shiftResult.error || attendanceResult.error) {
    return { success: false, error: "Không tải được lịch ca." };
  }

  const shifts: ScheduleShift[] = (shiftResult.data ?? []).map((row) => {
    const shift = row.shifts as unknown as {
      name: string;
      start_time: string;
      end_time: string;
    } | null;
    return {
      date: row.date,
      shift_name: shift?.name ?? "Ca làm",
      start_time: shift?.start_time ?? "00:00",
      end_time: shift?.end_time ?? "00:00",
    };
  });

  const attendance: ScheduleAttendance[] = (attendanceResult.data ?? []).map(
    (row) => ({
      date: row.date,
      check_in: row.check_in,
      check_out: row.check_out,
      status: row.status,
    }),
  );

  return { success: true, data: { shifts, attendance } };
}
