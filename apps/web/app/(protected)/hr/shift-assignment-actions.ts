"use server";

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";
import { canAccessBranch } from "@/_lib/branch-scope";
import { getVNWeekEndDateString } from "@comtammatu/shared/time";

const SHIFT_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
];

/* ─── Fetch Shift Assignments for a week ─── */

const fetchShiftAssignmentsSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const fetchShiftAssignments = withAction(
  {
    roles: SHIFT_ROLES,
    schema: fetchShiftAssignmentsSchema,
    permission: PERMISSION_KEYS.STAFF_MANAGE,
  },
  async (data, { supabase, claims }) => {
    if (!(await canAccessBranch(supabase, claims, data.branchId))) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    const weekEndDate = getVNWeekEndDateString(data.weekStartDate);

    const { data: result, error } = await supabase
      .from("shift_assignments")
      .select(
        `
      id, date, employee_id, shift_id,
      shifts ( id, name, start_time, end_time ),
      employees (
        id, employee_code,
        profiles ( full_name )
      )
    `,
      )
      .eq("branch_id", data.branchId)
      .eq("tenant_id", claims.tenant_id)
      .gte("date", data.weekStartDate)
      .lte("date", weekEndDate);

    if (error) {
      return { success: false, error: "Không thể tải phân ca." };
    }

    return { success: true, data: result ?? [] };
  },
);

/* ─── Create Shift Assignment ─── */

const createAssignmentSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  employeeId: z.coerce.number().int().positive(),
  shiftId: z.coerce.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const createShiftAssignment = withAction(
  {
    roles: SHIFT_ROLES,
    schema: createAssignmentSchema,
    permission: PERMISSION_KEYS.STAFF_MANAGE,
  },
  async (data, { supabase, claims }) => {
    if (!(await canAccessBranch(supabase, claims, data.branchId))) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    const { data: existing } = await supabase
      .from("shift_assignments")
      .select("id")
      .eq("tenant_id", claims.tenant_id)
      .eq("employee_id", data.employeeId)
      .eq("shift_id", data.shiftId)
      .eq("date", data.date)
      .maybeSingle();

    if (existing) {
      return {
        success: false,
        error: "Nhân viên đã được phân ca này trong ngày.",
      };
    }

    const { data: result, error } = await supabase
      .from("shift_assignments")
      .insert({
        tenant_id: claims.tenant_id,
        branch_id: data.branchId,
        employee_id: data.employeeId,
        shift_id: data.shiftId,
        date: data.date,
      })
      .select(
        `
      id, date, employee_id, shift_id,
      shifts ( id, name, start_time, end_time ),
      employees (
        id, employee_code,
        profiles ( full_name )
      )
    `,
      )
      .single();

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: "Phân ca trùng lặp." };
      }
      return { success: false, error: "Không thể tạo phân ca." };
    }

    return { success: true, data: result };
  },
);

/* ─── Delete Shift Assignment ─── */

const deleteAssignmentSchema = z.object({
  assignmentId: z.coerce.number().int().positive(),
});

export const deleteShiftAssignment = withAction(
  {
    roles: SHIFT_ROLES,
    schema: deleteAssignmentSchema,
    permission: PERMISSION_KEYS.STAFF_MANAGE,
  },
  async (data, { supabase, claims }) => {
    const { error } = await supabase
      .from("shift_assignments")
      .delete()
      .eq("id", data.assignmentId)
      .eq("tenant_id", claims.tenant_id);

    if (error) {
      return { success: false, error: "Không thể xóa phân ca." };
    }

    return { success: true };
  },
);

/* ─── Fetch Active Employees for Branch ─── */

const fetchEmployeesForBranchSchema = z.object({
  branchId: z.coerce.number().int().positive(),
});

export const fetchEmployeesForBranch = withAction(
  {
    roles: SHIFT_ROLES,
    schema: fetchEmployeesForBranchSchema,
    permission: PERMISSION_KEYS.STAFF_MANAGE,
  },
  async (data, { supabase, claims }) => {
    if (!(await canAccessBranch(supabase, claims, data.branchId))) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    const { data: result, error } = await supabase
      .from("employees")
      .select(
        `
      id, employee_code,
      profiles ( full_name, branch_id )
    `,
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .eq("profiles.branch_id", data.branchId);

    if (error) {
      return { success: false, error: "Không thể tải danh sách nhân viên." };
    }

    const filtered = (result ?? []).filter((e) => e.profiles !== null);

    return { success: true, data: filtered };
  },
);
