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

export interface ScheduleAttendance {
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  shift_name: string | null;
  start_time: string | null;
  end_time: string | null;
}

export interface ScheduleLeave {
  start_date: string;
  end_date: string;
  status: "pending" | "approved";
}

export interface ScheduleMonthData {
  attendance: ScheduleAttendance[];
  leaves: ScheduleLeave[];
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

  const [attendanceResult, leaveResult] = await Promise.all([
    supabase
      .from("attendance_records")
      .select("date, check_in, check_out, status, shifts ( name, start_time, end_time )")
      .eq("employee_id", employee.id)
      .eq("tenant_id", claims.tenant_id)
      .gte("date", parsed.data)
      .lte("date", monthEndDate)
      .order("date"),
    // Leave ranges overlapping the viewed month (RLS self-select).
    supabase
      .from("leave_requests")
      .select("start_date, end_date, status")
      .eq("employee_id", employee.id)
      .eq("tenant_id", claims.tenant_id)
      .in("status", ["pending", "approved"])
      .lte("start_date", monthEndDate)
      .gte("end_date", parsed.data)
      .order("start_date"),
  ]);

  if (attendanceResult.error || leaveResult.error) {
    return { success: false, error: "Không tải được lịch ca." };
  }

  const attendance: ScheduleAttendance[] = (attendanceResult.data ?? []).map(
    (row) => {
      // supabase-js typegen infers M:1 FK as array, but PostgREST returns
      // a single object at runtime. Cast through unknown to match runtime.
      const shift = row.shifts as unknown as {
        name: string;
        start_time: string;
        end_time: string;
      } | null;
      return {
        date: row.date,
        check_in: row.check_in,
        check_out: row.check_out,
        status: row.status,
        shift_name: shift?.name ?? null,
        start_time: shift?.start_time ?? null,
        end_time: shift?.end_time ?? null,
      };
    },
  );

  const leaves: ScheduleLeave[] = (leaveResult.data ?? []).flatMap((row) =>
    row.status === "pending" || row.status === "approved"
      ? [
          {
            start_date: row.start_date,
            end_date: row.end_date,
            status: row.status,
          },
        ]
      : [],
  );

  return { success: true, data: { attendance, leaves } };
}
