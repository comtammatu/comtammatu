"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { addVNDateDays } from "@comtammatu/shared/time";
import { z } from "zod";
import { withAction } from "@/_lib/with-action";
import { messages } from "@lib/messages";
import type {
  RosterAssignment,
  RosterEmployee,
  RosterShift,
  RosterWeekData,
} from "./roster-model";
import { getVNWeekDates } from "./week";

const ROSTER_ROLES: readonly StaffRole[] = ["owner", "branch_manager"];

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ");

const branchIdSchema = z.union([
  z.coerce.number().int().positive(),
  z.null(),
]);

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

const SHIFT_SELECT =
  "id, name, start_time, end_time, is_active";

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
        id, employee_code, is_active,
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
    .select("employee_id, work_date, shift_id")
    .eq("tenant_id", tenantId)
    .gte("work_date", weekStart)
    .lte("work_date", weekEnd);

  const [employeesResult, shiftsResult, assignmentsResult] = await Promise.all([
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

  const employees: RosterEmployee[] = (employeesResult.data ?? []).flatMap(
    (row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
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
        },
      ];
    },
  );

  const weekDateSet = new Set(weekDates);
  const assignments: RosterAssignment[] = (assignmentsResult.data ?? [])
    .flatMap((row) => {
      const record = row as {
        employee_id: number;
        work_date: string;
        shift_id: number;
      };
      if (!weekDateSet.has(record.work_date)) return [];
      return [
        {
          employeeId: record.employee_id,
          workDate: record.work_date,
          shiftId: record.shift_id,
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
  };
}

function revalidateRosterPaths(branchId: number | null) {
  revalidatePath("/hr/attendance");
  if (branchId != null) {
    revalidatePath(`/br/${branchId}/shift/roster`);
    revalidatePath(`/br/${branchId}/team`);
  }
}

export const fetchRosterWeek = withAction(
  {
    roles: ROSTER_ROLES,
    schema: weekSchema,
    permission: PERMISSION_KEYS.HR_ASSIGN_SHIFT,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { claims }) => {
    const scopeError = assertBranchManagerScope(claims, data.branchId);
    if (scopeError) return { success: false, error: scopeError };

    const payload = await loadRosterWeekData(
      claims.tenant_id,
      data.branchId,
      data.weekStart,
    );
    if ("error" in payload) {
      return { success: false, error: payload.error };
    }
    return { success: true, data: payload };
  },
);

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
    return { employees: [], shifts: [], assignments: [] };
  }
  return payload;
}
