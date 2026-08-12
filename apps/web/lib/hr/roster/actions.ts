"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import {
  PERMISSION_KEYS,
  STAFF_ROLES,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { addVNDateDays, getVNDateString } from "@comtammatu/shared/time";
import { z } from "zod";
import { withAction } from "@/_lib/with-action";
import { messages } from "@lib/messages";
import type {
  RosterAssignment,
  RosterEmployee,
  RosterShift,
  RosterWeekData,
} from "./roster-model";
import { ROSTER_WEEKDAY_KEYS } from "./roster-model";
import { getVNWeekDates, getVNWeekStartMonday } from "./week";

const ROSTER_ROLES: readonly StaffRole[] = STAFF_ROLES;

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ");

const branchIdSchema = z.union([z.coerce.number().int().positive(), z.null()]);

const assignmentSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  workDate: isoDateSchema,
  shiftId: z.coerce.number().int().positive(),
});

const weekSchema = z.object({
  branchId: branchIdSchema,
  weekStart: isoDateSchema,
});

const reconcileSchema = weekSchema.extend({
  assignments: z.array(assignmentSchema),
});

const copyWeekSchema = z.object({
  branchId: branchIdSchema,
  sourceWeekStart: isoDateSchema,
  targetWeekStart: isoDateSchema,
});

const setTodayAssignmentSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  branchId: branchIdSchema,
  shiftId: z.coerce.number().int().positive().nullable(),
});

const weeklyScheduleSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  branchId: branchIdSchema,
  effectiveFrom: isoDateSchema,
  days: z
    .array(
      z.object({
        weekday: z.coerce.number().int().min(1).max(7),
        shiftId: z.coerce.number().int().positive(),
      }),
    )
    .max(7)
    .refine(
      (days) => new Set(days.map((day) => day.weekday)).size === days.length,
      "Ngày làm bị trùng",
    ),
});

const SHIFT_SELECT = "id, name, start_time, end_time, is_active";

function assertBranchManagerScope(
  claims: { user_role: StaffRole; branch_id: number | null },
  branchId: number | null,
): string | null {
  if (claims.user_role !== "branch_manager") return null;
  if (branchId == null) {
    return "Quản lý chi nhánh chỉ phân ca tại chi nhánh được gán.";
  }
  if (claims.branch_id !== branchId) {
    return "Không có quyền truy cập chi nhánh này.";
  }
  return null;
}

function mapShiftRow(row: {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
}): RosterShift {
  return {
    id: row.id,
    name: row.name,
    startTime: row.start_time,
    endTime: row.end_time,
  };
}

async function loadRosterWeekData(
  tenantId: number,
  branchId: number | null,
  weekStart: string,
): Promise<RosterWeekData | { error: string }> {
  const weekDates = getVNWeekDates(weekStart);
  const weekEnd = addVNDateDays(weekStart, 6);
  const readClient = createServiceClient();

  let employeesQuery = readClient
    .from("employees")
    .select(
      `
        id, employee_code, start_date, is_active,
        profiles!inner (
          full_name, branch_id,
          positions ( label_vi )
        )
      `,
    )
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("employee_code", { ascending: true });

  employeesQuery =
    branchId == null
      ? employeesQuery.is("profiles.branch_id", null)
      : employeesQuery.eq("profiles.branch_id", branchId);

  const assignmentsQuery = readClient
    .from("shift_assignments" as never)
    .select("id, employee_id, work_date, shift_id, is_shift_leader")
    .eq("tenant_id", tenantId)
    .gte("work_date", weekStart)
    .lte("work_date", weekEnd);

  const schedulesQuery = readClient
    .from("employee_weekly_schedules" as never)
    .select(
      "employee_id, effective_from, monday_shift_id, tuesday_shift_id, wednesday_shift_id, thursday_shift_id, friday_shift_id, saturday_shift_id, sunday_shift_id",
    )
    .eq("tenant_id", tenantId);

  const [employeesResult, shiftsResult, assignmentsResult, schedulesResult] =
    await Promise.all([
      employeesQuery,
      readClient
        .from("shifts")
        .select(SHIFT_SELECT)
        .eq("tenant_id", tenantId)
        .is("branch_id", null)
        .eq("is_active", true)
        .order("start_time"),
      branchId == null
        ? assignmentsQuery.is("branch_id", null)
        : assignmentsQuery.eq("branch_id", branchId),
      schedulesQuery,
    ]);

  if (employeesResult.error) {
    console.error(
      "[hr/roster/actions:fetchRosterWeek] employees error:",
      employeesResult.error,
    );
    return { error: messages.hr.roster.loadEmployeesFailed };
  }
  if (shiftsResult.error) {
    console.error(
      "[hr/roster/actions:fetchRosterWeek] shifts error:",
      shiftsResult.error,
    );
    return { error: messages.hr.roster.loadShiftsFailed };
  }
  if (assignmentsResult.error) {
    console.error(
      "[hr/roster/actions:fetchRosterWeek] assignments error:",
      assignmentsResult.error,
    );
    return { error: messages.hr.roster.loadAssignmentsFailed };
  }
  if (schedulesResult.error) {
    console.error(
      "[hr/roster/actions:fetchRosterWeek] schedules error:",
      schedulesResult.error,
    );
    return { error: messages.hr.roster.loadSchedulesFailed };
  }

  const employees: RosterEmployee[] = (employeesResult.data ?? []).flatMap(
    (row) => {
      const profile = Array.isArray(row.profiles)
        ? row.profiles[0]
        : row.profiles;
      if (!profile) return [];
      const position = Array.isArray(profile.positions)
        ? profile.positions[0]
        : profile.positions;
      return [
        {
          employeeId: row.id,
          fullName: profile.full_name ?? messages.hr.roster.unnamedEmployee,
          employeeCode: row.employee_code,
          positionLabel: position?.label_vi ?? null,
          startDate: row.start_date,
        },
      ];
    },
  );

  const weekDateSet = new Set(weekDates);
  const assignments: RosterAssignment[] = (assignmentsResult.data ?? [])
    .flatMap((row) => {
      const record = row as {
        id: number;
        employee_id: number;
        work_date: string;
        shift_id: number | null;
        is_shift_leader?: boolean | null;
      };
      if (!weekDateSet.has(record.work_date) || record.shift_id == null)
        return [];
      return [
        {
          id: record.id,
          employeeId: record.employee_id,
          workDate: record.work_date,
          shiftId: record.shift_id,
          isShiftLeader: record.is_shift_leader === true,
        },
      ];
    })
    .toSorted((left, right) =>
      left.workDate === right.workDate
        ? left.employeeId - right.employeeId
        : left.workDate.localeCompare(right.workDate),
    );

  return {
    employees,
    shifts: (shiftsResult.data ?? []).map(mapShiftRow),
    assignments,
    weeklySchedules: (schedulesResult.data ?? []).flatMap((row) => {
      const schedule = row as Record<string, number | string | null>;
      const employeeId = Number(schedule.employee_id);
      if (!employees.some((employee) => employee.employeeId === employeeId)) {
        return [];
      }
      return [
        {
          employeeId,
          effectiveFrom: String(schedule.effective_from),
          shiftsByDay: Object.fromEntries(
            ROSTER_WEEKDAY_KEYS.map((day) => [
              day,
              schedule[`${day}_shift_id`] == null
                ? null
                : Number(schedule[`${day}_shift_id`]),
            ]),
          ) as RosterWeekData["weeklySchedules"][number]["shiftsByDay"],
        },
      ];
    }),
  };
}

function revalidateRosterPaths(branchId: number | null) {
  revalidatePath("/hr/attendance");
  if (branchId != null) {
    revalidatePath(`/br/${branchId}/shift/roster`);
    revalidatePath(`/br/${branchId}/team`);
  }
}

export const reconcileShiftAssignmentsWeek = withAction(
  {
    roles: ROSTER_ROLES,
    schema: reconcileSchema,
    permission: PERMISSION_KEYS.HR_ASSIGN_SHIFT,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    const scopeError = assertBranchManagerScope(claims, data.branchId);
    if (scopeError) return { success: false, error: scopeError };

    const { error } = await supabase.rpc(
      "reconcile_shift_assignments_week" as never,
      {
        p_tenant_id: claims.tenant_id,
        p_branch_id: data.branchId,
        p_week_start: data.weekStart,
        p_assignments: data.assignments.map((assignment) => ({
          employee_id: assignment.employeeId,
          work_date: assignment.workDate,
          shift_id: assignment.shiftId,
        })),
      } as never,
    );

    if (error) {
      console.error(
        "[hr/roster/actions:reconcileShiftAssignmentsWeek] RPC error:",
        error,
      );
      return { success: false, error: messages.hr.roster.saveFailed };
    }

    revalidateRosterPaths(data.branchId);
    return { success: true, data: null };
  },
);

export const setEmployeeTodayShiftAssignment = withAction(
  {
    roles: ROSTER_ROLES,
    schema: setTodayAssignmentSchema,
    permission: PERMISSION_KEYS.HR_ASSIGN_SHIFT,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    const scopeError = assertBranchManagerScope(claims, data.branchId);
    if (scopeError) return { success: false, error: scopeError };

    const today = getVNDateString();
    const weekStart = getVNWeekStartMonday(today);
    const service = createServiceClient();
    const { data: employee } = await service
      .from("employees")
      .select("id, profiles!inner(branch_id)")
      .eq("tenant_id", claims.tenant_id)
      .eq("id", data.employeeId)
      .maybeSingle();
    if (!employee || employee.profiles?.branch_id !== data.branchId) {
      return { success: false, error: messages.common.forbidden };
    }

    const current = await loadRosterWeekData(
      claims.tenant_id,
      data.branchId,
      weekStart,
    );
    if ("error" in current) {
      return { success: false, error: current.error };
    }
    if (
      data.shiftId != null &&
      !current.shifts.some((shift) => shift.id === data.shiftId)
    ) {
      return { success: false, error: "Khung ca không hợp lệ." };
    }

    const assignments = current.assignments
      .filter((assignment) => assignment.shiftId != null)
      .map((assignment) => ({
        id: assignment.id,
        employeeId: assignment.employeeId,
        workDate: assignment.workDate,
        shiftId: assignment.shiftId,
        isShiftLeader: assignment.isShiftLeader,
      }));

    if (data.shiftId != null) {
      const alreadyAssigned = assignments.some(
        (assignment) =>
          assignment.employeeId === data.employeeId &&
          assignment.workDate === today &&
          assignment.shiftId === data.shiftId,
      );
      if (!alreadyAssigned) {
        assignments.push({
          id: 0,
          employeeId: data.employeeId,
          workDate: today,
          shiftId: data.shiftId,
          isShiftLeader: false,
        });
      }
    } else {
      const { data: punchedToday } = await service
        .from("attendance_records")
        .select("shift_id")
        .eq("tenant_id", claims.tenant_id)
        .eq("employee_id", data.employeeId)
        .eq("date", today);
      const punchedShiftIds = new Set(
        (punchedToday ?? [])
          .map((row) => row.shift_id)
          .filter((shiftId): shiftId is number => shiftId != null),
      );
      for (let index = assignments.length - 1; index >= 0; index -= 1) {
        const assignment = assignments[index]!;
        if (
          assignment.employeeId === data.employeeId &&
          assignment.workDate === today &&
          !punchedShiftIds.has(assignment.shiftId)
        ) {
          assignments.splice(index, 1);
        }
      }
    }

    const { error } = await supabase.rpc(
      "reconcile_shift_assignments_week" as never,
      {
        p_tenant_id: claims.tenant_id,
        p_branch_id: data.branchId,
        p_week_start: weekStart,
        p_assignments: assignments.map((assignment) => ({
          employee_id: assignment.employeeId,
          work_date: assignment.workDate,
          shift_id: assignment.shiftId,
        })),
      } as never,
    );
    if (error) {
      console.error(
        "[hr/roster/actions:setEmployeeTodayShiftAssignment] RPC error:",
        error,
      );
      return { success: false, error: messages.hr.roster.saveFailed };
    }

    revalidateRosterPaths(data.branchId);
    revalidatePath("/hr");
    return { success: true, data: null };
  },
);

export const saveEmployeeWeeklySchedule = withAction(
  {
    roles: ROSTER_ROLES,
    schema: weeklyScheduleSchema,
    permission: PERMISSION_KEYS.HR_ASSIGN_SHIFT,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    const scopeError = assertBranchManagerScope(claims, data.branchId);
    if (scopeError) return { success: false, error: scopeError };

    const { error } = await supabase.rpc(
      "save_employee_weekly_schedule" as never,
      {
        p_employee_id: data.employeeId,
        p_effective_from: data.effectiveFrom,
        p_days: data.days.map((day) => ({
          weekday: day.weekday,
          shift_id: day.shiftId,
        })),
      } as never,
    );
    if (error) {
      console.error(
        "[hr/roster/actions:saveEmployeeWeeklySchedule] RPC error:",
        error,
      );
      const knownError = error.message.includes(
        "schedule_before_employee_start",
      )
        ? messages.hr.roster.scheduleBeforeEmployeeStart
        : error.message.includes("employee_not_found")
          ? messages.hr.roster.employeeNotFound
          : messages.hr.roster.saveScheduleFailed;
      return { success: false, error: knownError };
    }

    revalidateRosterPaths(data.branchId);
    revalidatePath("/hr");
    return { success: true, data: null };
  },
);

const setLeaderSchema = z.object({
  branchId: branchIdSchema,
  assignmentId: z.coerce.number().int().positive(),
  isLeader: z.boolean(),
});

export const setShiftAssignmentLeader = withAction(
  {
    roles: ROSTER_ROLES,
    schema: setLeaderSchema,
    permission: PERMISSION_KEYS.HR_ASSIGN_SHIFT,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    const scopeError = assertBranchManagerScope(claims, data.branchId);
    if (scopeError) return { success: false, error: scopeError };
    if (data.branchId == null) {
      return { success: false, error: messages.hr.roster.shiftLeaderFailed };
    }

    const { error } = await supabase.rpc(
      "set_shift_assignment_leader" as never,
      {
        p_assignment_id: data.assignmentId,
        p_is_leader: data.isLeader,
      } as never,
    );
    if (error) {
      console.error(
        "[hr/roster/actions:setShiftAssignmentLeader] RPC error:",
        error,
      );
      return { success: false, error: messages.hr.roster.shiftLeaderFailed };
    }

    revalidateRosterPaths(data.branchId);
    return { success: true, data: null };
  },
);

export const copyRosterWeek = withAction(
  {
    roles: ROSTER_ROLES,
    schema: copyWeekSchema,
    permission: PERMISSION_KEYS.HR_ASSIGN_SHIFT,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    const scopeError = assertBranchManagerScope(claims, data.branchId);
    if (scopeError) return { success: false, error: scopeError };

    const { error } = await supabase.rpc(
      "copy_shift_assignments_week" as never,
      {
        p_tenant_id: claims.tenant_id,
        p_branch_id: data.branchId,
        p_source_week_start: data.sourceWeekStart,
        p_target_week_start: data.targetWeekStart,
      } as never,
    );

    if (error) {
      console.error("[hr/roster/actions:copyRosterWeek] RPC error:", error);
      return { success: false, error: messages.hr.roster.copyFailed };
    }

    revalidateRosterPaths(data.branchId);
    return { success: true, data: null };
  },
);

export async function loadRosterWeekForPage(
  tenantId: number,
  branchId: number | null,
  weekStart: string,
): Promise<RosterWeekData> {
  const payload = await loadRosterWeekData(tenantId, branchId, weekStart);
  if ("error" in payload) {
    return { employees: [], shifts: [], assignments: [], weeklySchedules: [] };
  }
  return payload;
}
