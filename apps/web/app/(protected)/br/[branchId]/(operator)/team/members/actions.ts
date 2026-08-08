"use server";

import { z } from "zod";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import {
  getVNMonthEndDateString,
  getVNMonthStartDateString,
  parseISODateParts,
} from "@comtammatu/shared/time";
import { withAction } from "@/_lib/with-action";
import {
  countCompletedShiftWorkdays,
  countOverlapDays,
} from "@lib/staff-runtime/_lib/workday-math";

const TEAM_MEMBER_DETAIL_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
];

const fetchTeamMemberMonthDetailSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  employeeId: z.coerce.number().int().positive(),
  monthStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type TeamMemberMonthDetail = {
  monthStart: string;
  monthEnd: string;
  workdays: number;
  workHours: number;
  approvedLeaveDays: number;
  pendingLeaveCount: number;
};

function hoursBetween(checkIn: string, checkOut: string): number {
  const ms = Date.parse(checkOut) - Date.parse(checkIn);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round((ms / 3_600_000) * 10) / 10;
}

export const fetchTeamMemberMonthDetail = withAction(
  {
    roles: TEAM_MEMBER_DETAIL_ROLES,
    schema: fetchTeamMemberMonthDetailSchema,
    permission: PERMISSION_KEYS.HR_VIEW_EMPLOYEE,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { claims }) => {
    if (
      claims.user_role === "branch_manager" &&
      claims.branch_id !== data.branchId
    ) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    const monthStart = data.monthStart ?? getVNMonthStartDateString();
    const monthParts = parseISODateParts(monthStart);
    if (!monthParts || monthParts.day !== 1) {
      return { success: false, error: "Tháng không hợp lệ" };
    }
    const monthEnd = getVNMonthEndDateString(
      monthParts.year,
      monthParts.month,
    );

    const readClient = createServiceClient();

    const employeeResult = await readClient
      .from("employees")
      .select(
        `
          id,
          is_active,
          profiles!inner ( branch_id )
        `,
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("id", data.employeeId)
      .eq("profiles.branch_id", data.branchId)
      .maybeSingle();

    if (employeeResult.error) {
      console.error(
        "[team/members:fetchTeamMemberMonthDetail] employee lookup failed",
        employeeResult.error,
      );
      return { success: false, error: "Không tải được hồ sơ nhân viên." };
    }
    if (!employeeResult.data || employeeResult.data.is_active === false) {
      return {
        success: false,
        error: "Nhân viên không thuộc chi nhánh này.",
      };
    }

    const [attendanceResult, leaveResult] = await Promise.all([
      readClient
        .from("attendance_records")
        .select("date, check_in, check_out")
        .eq("tenant_id", claims.tenant_id)
        .eq("branch_id", data.branchId)
        .eq("employee_id", data.employeeId)
        .gte("date", monthStart)
        .lte("date", monthEnd),
      readClient
        .from("leave_requests")
        .select("start_date, end_date, status")
        .eq("tenant_id", claims.tenant_id)
        .eq("branch_id", data.branchId)
        .eq("employee_id", data.employeeId)
        .in("status", ["pending", "approved"])
        .lte("start_date", monthEnd)
        .gte("end_date", monthStart),
    ]);

    if (attendanceResult.error || leaveResult.error) {
      console.error(
        "[team/members:fetchTeamMemberMonthDetail] month load failed",
        {
          attendanceCode: attendanceResult.error?.code,
          leaveCode: leaveResult.error?.code,
        },
      );
      return { success: false, error: "Không tải được công và nghỉ phép tháng này." };
    }

    const completedByDate = new Map<string, number>();
    let workHours = 0;
    for (const row of attendanceResult.data ?? []) {
      if (!row.check_in || !row.check_out) continue;
      completedByDate.set(row.date, (completedByDate.get(row.date) ?? 0) + 1);
      workHours += hoursBetween(row.check_in, row.check_out);
    }
    workHours = Math.round(workHours * 10) / 10;

    let workdays = 0;
    for (const count of completedByDate.values()) {
      workdays += countCompletedShiftWorkdays(count);
    }
    workdays = Math.round(workdays * 10) / 10;

    let approvedLeaveDays = 0;
    let pendingLeaveCount = 0;
    for (const leave of leaveResult.data ?? []) {
      if (leave.status === "pending") {
        pendingLeaveCount += 1;
        continue;
      }
      if (leave.status !== "approved") continue;
      approvedLeaveDays += countOverlapDays(
        leave.start_date,
        leave.end_date,
        monthStart,
        monthEnd,
      );
    }

    const detail: TeamMemberMonthDetail = {
      monthStart,
      monthEnd,
      workdays,
      workHours,
      approvedLeaveDays,
      pendingLeaveCount,
    };

    return { success: true, data: detail };
  },
);
