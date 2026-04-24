"use server";

import { z } from "zod";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaimsFromAccessToken } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";

const weekStartSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Ngày không hợp lệ (YYYY-MM-DD)" });

export interface ScheduleShift {
  date: string;
  shift_name: string;
  start_time: string;
  end_time: string;
}

export async function fetchMySchedule(
  weekStartDate: string,
): Promise<ActionResult<ScheduleShift[]>> {
  const parsed = weekStartSchema.safeParse(weekStartDate);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ngày không hợp lệ",
    };
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

  // Calculate week end (6 days after start)
  const start = new Date(parsed.data + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const weekEndDate = end.toISOString().split("T")[0]!;

  // Fetch shift assignments for this employee in the week range
  const { data, error } = await supabase
    .from("shift_assignments")
    .select("date, shifts ( name, start_time, end_time )")
    .eq("employee_id", employee.id)
    .eq("tenant_id", claims.tenant_id)
    .gte("date", parsed.data)
    .lte("date", weekEndDate)
    .order("date");

  if (error) {
    return { success: false, error: "Không tải được lịch ca." };
  }

  const shifts: ScheduleShift[] = (data ?? []).map((row) => {
    const shift = row.shifts as {
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

  return { success: true, data: shifts };
}
