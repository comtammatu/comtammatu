"use server";

import { createServiceClient } from "@comtammatu/database/supabase/service";
import { loadAuthState } from "@/_lib/auth";
import {
  getVNMonthStartDateString,
  getVNMonthEndDateString,
  getVNMonthYear,
} from "@comtammatu/shared/time";

export async function fetchEmployeeSummary(employeeId: number) {
  const { claims: { tenant_id } } = await loadAuthState();
  const service = createServiceClient();

  const startOfMonth = getVNMonthStartDateString();
  const { year, month } = getVNMonthYear();
  const endOfMonth = getVNMonthEndDateString(year, month);

  // Fetch leave requests for the month
  const { data: leaves } = await service
    .from("leave_requests")
    .select("id, start_date, end_date, reason, status")
    .eq("tenant_id", tenant_id)
    .eq("employee_id", employeeId)
    .gte("start_date", startOfMonth)
    .lte("start_date", endOfMonth)
    .order("start_date", { ascending: false });

  // Fetch attendance records for the month
  const { data: attendance } = await service
    .from("attendance_records")
    .select("id, check_in, check_out, date")
    .eq("tenant_id", tenant_id)
    .eq("employee_id", employeeId)
    .gte("date", startOfMonth)
    .lte("date", endOfMonth)
    .order("date", { ascending: false });

  return {
    success: true,
    data: {
      leaves: leaves || [],
      attendanceCount: attendance?.length || 0,
      attendanceRecords: attendance?.slice(0, 5) || [], // Latest 5
    },
  };
}
