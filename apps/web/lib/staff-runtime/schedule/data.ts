import "server-only";

import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  getVNMonthEndDateString,
  parseISODateParts,
} from "@comtammatu/shared/time";
import type { EmployeeContext } from "../_lib/staff-runtime-context";
import {
  calculateAnnualLeaveUsedThroughMonth,
  calculateMonthlyLeaveUsedInMonth,
  type LeaveRange,
} from "@lib/hr/payroll-day-math";
import { fetchTenantHrLeavePolicy } from "@lib/hr/leave-policy-data";
import { mergeScheduleAttendanceWithAssignments } from "../_lib/schedule-month";

const monthStartSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Ngày không hợp lệ (YYYY-MM-DD)" });

export interface ScheduleAttendance {
  date: string;
  check_in: string | null;
  check_out: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
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

export interface ScheduleAnnualLeaveBalance {
  year: number;
  entitlementDays: number;
  usedDays: number;
  remainingDays: number;
}

export interface ScheduleMonthlyLeaveBalance {
  entitlementDays: number;
  usedDays: number;
  remainingDays: number;
}

export interface ScheduleMonthData {
  attendance: ScheduleAttendance[];
  leaves: ScheduleLeave[];
  annualLeaveBalance: ScheduleAnnualLeaveBalance | null;
  monthlyLeaveBalance: ScheduleMonthlyLeaveBalance | null;
  standardWorkdays: number;
}

/**
 * Shared schedule read for RSC and the client-invoked Server Action.
 * The caller owns authentication so the initial RSC can reuse its existing
 * employee context instead of crossing an Action boundary and probing Auth a
 * second time.
 */
export async function loadScheduleMonth(
  ctx: EmployeeContext,
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

  const { supabase, claims, employeeId } = ctx;
  const monthEndDate = getVNMonthEndDateString(
    monthParts.year,
    monthParts.month,
  );
  const yearStartDate = `${monthParts.year}-01-01`;
  const yearEndDate = `${monthParts.year}-12-31`;

  const [
    attendanceResult,
    assignmentResult,
    leaveResult,
    entitlementResult,
    approvedAnnualLeaveResult,
    policyResult,
  ] = await Promise.all([
    supabase
      .from("attendance_records")
      .select(
        "date, check_in, check_out, scheduled_start_at, scheduled_end_at, status, shifts ( name, start_time, end_time )",
      )
      .eq("employee_id", employeeId)
      .eq("tenant_id", claims.tenant_id)
      .gte("date", parsed.data)
      .lte("date", monthEndDate)
      .order("date"),
    supabase
      .from("shift_assignments")
      .select("work_date, shift_id, shifts ( name, start_time, end_time )")
      .eq("employee_id", employeeId)
      .eq("tenant_id", claims.tenant_id)
      .gte("work_date", parsed.data)
      .lte("work_date", monthEndDate)
      .order("work_date"),
    // Leave ranges overlapping the viewed month (RLS self-select).
    supabase
      .from("leave_requests")
      .select("start_date, end_date, status, leave_type")
      .eq("employee_id", employeeId)
      .eq("tenant_id", claims.tenant_id)
      .in("status", ["pending", "approved"])
      .lte("start_date", monthEndDate)
      .gte("end_date", parsed.data)
      .order("start_date"),
    supabase
      .from("annual_leave_entitlements")
      .select("entitlement_days")
      .eq("employee_id", employeeId)
      .eq("tenant_id", claims.tenant_id)
      .eq("year", monthParts.year)
      .maybeSingle(),
    supabase
      .from("leave_requests")
      .select("start_date, end_date")
      .eq("employee_id", employeeId)
      .eq("tenant_id", claims.tenant_id)
      .eq("leave_type", "annual")
      .eq("status", "approved")
      .lte("start_date", yearEndDate)
      .gte("end_date", yearStartDate),
    fetchTenantHrLeavePolicy({
      supabase,
      tenantId: claims.tenant_id,
    }),
  ]);

  if (
    attendanceResult.error ||
    assignmentResult.error ||
    leaveResult.error ||
    entitlementResult.error ||
    approvedAnnualLeaveResult.error ||
    !policyResult.success
  ) {
    return { success: false, error: "Không tải được lịch ca." };
  }

  const punched: ScheduleAttendance[] = (attendanceResult.data ?? []).map(
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
        scheduled_start_at: row.scheduled_start_at,
        scheduled_end_at: row.scheduled_end_at,
        status: row.status,
        shift_name: shift?.name ?? null,
        start_time: shift?.start_time ?? null,
        end_time: shift?.end_time ?? null,
      };
    },
  );
  const assignments = (assignmentResult.data ?? []).map((row) => {
    const shift = row.shifts as unknown as {
      name: string;
      start_time: string;
      end_time: string;
    } | null;
    return {
      workDate: row.work_date,
      shiftId: row.shift_id,
      shiftName: shift?.name ?? null,
      startTime: shift?.start_time ?? null,
      endTime: shift?.end_time ?? null,
    };
  });
  const attendance = mergeScheduleAttendanceWithAssignments(
    punched,
    assignments,
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
  const policy = policyResult.data;
  const entitlementDays =
    entitlementResult.data?.entitlement_days == null
      ? null
      : Number(entitlementResult.data.entitlement_days);
  const approvedAnnualLeaves: LeaveRange[] = (
    approvedAnnualLeaveResult.data ?? []
  ).map((leave) => ({
    employeeId,
    startDate: leave.start_date,
    endDate: leave.end_date,
    leaveType: "annual",
  }));
  const monthlyLeaveUsedDays = calculateMonthlyLeaveUsedInMonth({
    leaves: approvedAnnualLeaves,
    year: monthParts.year,
    month: monthParts.month,
    monthlyLeaveDays: policy.monthlyLeaveDays,
  });
  const usedDays =
    entitlementDays == null
      ? 0
      : calculateAnnualLeaveUsedThroughMonth({
          leaves: approvedAnnualLeaves,
          entitlementDays,
          monthlyLeaveDays: policy.monthlyLeaveDays,
          year: monthParts.year,
          throughMonth: monthParts.month,
        });

  return {
    success: true,
    data: {
      attendance,
      leaves,
      annualLeaveBalance:
        entitlementDays == null
          ? null
          : {
              year: monthParts.year,
              entitlementDays,
              usedDays,
              remainingDays: Math.max(0, entitlementDays - usedDays),
            },
      monthlyLeaveBalance: {
        entitlementDays: policy.monthlyLeaveDays,
        usedDays: monthlyLeaveUsedDays,
        remainingDays: Math.max(
          0,
          policy.monthlyLeaveDays - monthlyLeaveUsedDays,
        ),
      },
      standardWorkdays: policy.standardWorkdays,
    },
  };
}
