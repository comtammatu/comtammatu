"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  PERMISSION_KEYS,
  type JwtClaims,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";
import { canAccessBranch } from "@/_lib/branch-scope";
import {
  getVNDateString,
  getVNWeekEndDateString,
} from "@comtammatu/shared/time";
import { createServiceClient } from "@comtammatu/database/supabase/service";

const SHIFT_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "branch_manager",
];

export type BulkAssignmentMode = "skip_existing" | "replace_future";

export interface BulkAssignmentResult {
  mode: BulkAssignmentMode;
  requested: number;
  created: number;
  replaced: number;
  skipped: number;
  invalidEmployeeIds: number[];
  invalidDates: string[];
}

export interface BulkDeleteAssignmentsResult {
  requested: number;
  deleted: number;
  skipped: number;
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function revalidateHrSchedulePaths() {
  revalidatePath("/hr");
  revalidatePath("/employee");
  revalidatePath("/employee/schedule");
}

function normalizeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number")
    : [];
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function nullableRpcNumber(value: number | null | undefined): number {
  return (value ?? null) as unknown as number;
}

function normalizeBulkAssignmentResult(value: unknown): BulkAssignmentResult {
  const result =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const mode =
    result.mode === "replace_future" ? "replace_future" : "skip_existing";
  return {
    mode,
    requested: normalizeNumber(result.requested),
    created: normalizeNumber(result.created),
    replaced: normalizeNumber(result.replaced),
    skipped: normalizeNumber(result.skipped),
    invalidEmployeeIds: normalizeNumberArray(result.invalidEmployeeIds),
    invalidDates: normalizeStringArray(result.invalidDates),
  };
}

function normalizeBulkDeleteResult(value: unknown): BulkDeleteAssignmentsResult {
  const result =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    requested: normalizeNumber(result.requested),
    deleted: normalizeNumber(result.deleted),
    skipped: normalizeNumber(result.skipped),
  };
}

function mapBulkAssignmentError(message: string | undefined): string {
  if (message?.includes("checklist_template_not_found")) {
    return "Checklist template không thuộc phạm vi chi nhánh này.";
  }
  if (message?.includes("invalid_bulk_assignment_mode")) {
    return "Chế độ xử lý trùng không hợp lệ.";
  }
  if (message?.includes("employee_ids_required")) {
    return "Chọn ít nhất một nhân viên.";
  }
  if (message?.includes("assignment_dates_required")) {
    return "Chọn ít nhất một ngày phân ca.";
  }
  if (message?.includes("branch_not_found")) {
    return "Chi nhánh không hợp lệ hoặc đã ngưng hoạt động.";
  }
  if (message?.includes("shift_not_found")) {
    return "Ca làm không hợp lệ hoặc đã ngưng dùng.";
  }
  return "Không thể phân ca hàng loạt.";
}

async function ensureChecklistTemplateAccess(
  claims: JwtClaims,
  branchId: number,
  templateId: number | null | undefined,
): Promise<string | null> {
  if (templateId == null) return null;

  const { data } = await createServiceClient()
    .from("shift_checklist_templates")
    .select("id")
    .eq("tenant_id", claims.tenant_id)
    .eq("id", templateId)
    .eq("is_active", true)
    .or(`branch_id.is.null,branch_id.eq.${branchId}`)
    .maybeSingle();

  return data ? null : "Checklist template không thuộc phạm vi chi nhánh này.";
}

function mapBulkDeleteError(message: string | undefined): string {
  if (message?.includes("assignment_ids_required")) {
    return "Chọn ít nhất một phân ca.";
  }
  return "Không thể xóa phân ca đã chọn.";
}

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
      id, date, branch_id, employee_id, shift_id,
      checklist_template_id,
      shifts ( id, name, start_time, end_time ),
      shift_checklist_templates ( id, name, branch_id ),
      employees (
        id, employee_code,
        profiles (
          full_name,
          positions ( label_vi )
        )
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
  date: dateSchema,
  checklistTemplateId: z.coerce.number().int().positive().nullable().optional(),
});

export const createShiftAssignment = withAction(
  {
    roles: SHIFT_ROLES,
    schema: createAssignmentSchema,
    permission: PERMISSION_KEYS.STAFF_MANAGE,
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    if (!(await canAccessBranch(supabase, claims, data.branchId))) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }
    const checklistError = await ensureChecklistTemplateAccess(
      claims,
      data.branchId,
      data.checklistTemplateId,
    );
    if (checklistError) return { success: false, error: checklistError };

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
        checklist_template_id: data.checklistTemplateId ?? null,
      })
      .select(
        `
      id, date, branch_id, employee_id, shift_id,
      checklist_template_id,
      shifts ( id, name, start_time, end_time ),
      shift_checklist_templates ( id, name, branch_id ),
      employees (
        id, employee_code,
        profiles (
          full_name,
          positions ( label_vi )
        )
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

    revalidateHrSchedulePaths();
    return { success: true, data: result };
  },
);

/* ─── Bulk Shift Assignment ─── */

const bulkAssignShiftsSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  shiftId: z.coerce.number().int().positive(),
  employeeIds: z.array(z.coerce.number().int().positive()).min(1).max(200),
  dates: z.array(dateSchema).min(1).max(62),
  mode: z.enum(["skip_existing", "replace_future"]).default("skip_existing"),
  checklistTemplateId: z.coerce.number().int().positive().nullable().optional(),
});

export const bulkAssignShifts = withAction(
  {
    roles: SHIFT_ROLES,
    schema: bulkAssignShiftsSchema,
    permission: PERMISSION_KEYS.STAFF_MANAGE,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    if (!(await canAccessBranch(supabase, claims, data.branchId))) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }
    const checklistError = await ensureChecklistTemplateAccess(
      claims,
      data.branchId,
      data.checklistTemplateId,
    );
    if (checklistError) return { success: false, error: checklistError };

    const { data: result, error } = await createServiceClient().rpc(
      "bulk_upsert_shift_assignments",
      {
        p_tenant_id: claims.tenant_id,
        p_branch_id: data.branchId,
        p_shift_id: data.shiftId,
        p_employee_ids: data.employeeIds,
        p_dates: data.dates,
        p_mode: data.mode,
        p_checklist_template_id: nullableRpcNumber(data.checklistTemplateId),
      },
    );

    if (error) {
      return { success: false, error: mapBulkAssignmentError(error.message) };
    }

    revalidateHrSchedulePaths();
    return { success: true, data: normalizeBulkAssignmentResult(result) };
  },
);

/* ─── Copy Week Assignments ─── */

const copyPreviousWeekAssignmentsSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  sourceWeekStartDate: dateSchema,
  targetWeekStartDate: dateSchema,
  mode: z.enum(["skip_existing", "replace_future"]).default("skip_existing"),
});

export const copyPreviousWeekAssignments = withAction(
  {
    roles: SHIFT_ROLES,
    schema: copyPreviousWeekAssignmentsSchema,
    permission: PERMISSION_KEYS.STAFF_MANAGE,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    if (!(await canAccessBranch(supabase, claims, data.branchId))) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    const { data: result, error } = await createServiceClient().rpc(
      "copy_shift_assignments_week",
      {
        p_tenant_id: claims.tenant_id,
        p_branch_id: data.branchId,
        p_source_week_start: data.sourceWeekStartDate,
        p_target_week_start: data.targetWeekStartDate,
        p_mode: data.mode,
      },
    );

    if (error) {
      return { success: false, error: mapBulkAssignmentError(error.message) };
    }

    revalidateHrSchedulePaths();
    return { success: true, data: normalizeBulkAssignmentResult(result) };
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
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    const today = getVNDateString();
    const { data: assignment } = await supabase
      .from("shift_assignments")
      .select("id, branch_id, date")
      .eq("id", data.assignmentId)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle();

    if (!assignment) {
      return { success: false, error: "Không tìm thấy phân ca." };
    }
    if (!(await canAccessBranch(supabase, claims, assignment.branch_id))) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }
    if (assignment.date <= today) {
      return {
        success: false,
        error: "Chỉ được xóa phân ca tương lai.",
      };
    }

    const { error } = await createServiceClient()
      .from("shift_assignments")
      .delete()
      .eq("id", data.assignmentId)
      .eq("tenant_id", claims.tenant_id);

    if (error) {
      return { success: false, error: "Không thể xóa phân ca." };
    }

    revalidateHrSchedulePaths();
    return { success: true };
  },
);

const bulkDeleteFutureAssignmentsSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  assignmentIds: z.array(z.coerce.number().int().positive()).min(1).max(500),
});

export const bulkDeleteFutureAssignments = withAction(
  {
    roles: SHIFT_ROLES,
    schema: bulkDeleteFutureAssignmentsSchema,
    permission: PERMISSION_KEYS.STAFF_MANAGE,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    if (!(await canAccessBranch(supabase, claims, data.branchId))) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    const { data: result, error } = await createServiceClient().rpc(
      "bulk_delete_future_shift_assignments",
      {
        p_tenant_id: claims.tenant_id,
        p_branch_id: data.branchId,
        p_assignment_ids: data.assignmentIds,
      },
    );

    if (error) {
      return { success: false, error: mapBulkDeleteError(error.message) };
    }

    revalidateHrSchedulePaths();
    return { success: true, data: normalizeBulkDeleteResult(result) };
  },
);

const updateShiftAssignmentSchema = z.object({
  assignmentId: z.coerce.number().int().positive(),
  branchId: z.coerce.number().int().positive(),
  employeeId: z.coerce.number().int().positive(),
  shiftId: z.coerce.number().int().positive(),
  date: dateSchema,
  checklistTemplateId: z.coerce.number().int().positive().nullable().optional(),
});

export const updateShiftAssignment = withAction(
  {
    roles: SHIFT_ROLES,
    schema: updateShiftAssignmentSchema,
    permission: PERMISSION_KEYS.STAFF_MANAGE,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    if (!(await canAccessBranch(supabase, claims, data.branchId))) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    const today = getVNDateString();
    if (data.date <= today) {
      return { success: false, error: "Chỉ được sửa phân ca tương lai." };
    }
    const checklistError = await ensureChecklistTemplateAccess(
      claims,
      data.branchId,
      data.checklistTemplateId,
    );
    if (checklistError) return { success: false, error: checklistError };

    const service = createServiceClient();
    const [{ data: assignment }, { data: shift }, { data: employee }] =
      await Promise.all([
        service
          .from("shift_assignments")
          .select("id")
          .eq("id", data.assignmentId)
          .eq("tenant_id", claims.tenant_id)
          .eq("branch_id", data.branchId)
          .gt("date", today)
          .maybeSingle(),
        service
          .from("shifts")
          .select("id")
          .eq("id", data.shiftId)
          .eq("tenant_id", claims.tenant_id)
          .eq("branch_id", data.branchId)
          .eq("is_active", true)
          .maybeSingle(),
        service
          .from("employees")
          .select("id, profiles!inner(branch_id)")
          .eq("id", data.employeeId)
          .eq("tenant_id", claims.tenant_id)
          .eq("is_active", true)
          .eq("profiles.branch_id", data.branchId)
          .maybeSingle(),
      ]);

    if (!assignment) {
      return { success: false, error: "Không tìm thấy phân ca tương lai." };
    }
    if (!shift) {
      return { success: false, error: "Ca làm không hợp lệ hoặc đã ngưng dùng." };
    }
    if (!employee) {
      return { success: false, error: "Nhân viên không thuộc chi nhánh này." };
    }

    const { data: result, error } = await service
      .from("shift_assignments")
      .update({
        employee_id: data.employeeId,
        shift_id: data.shiftId,
        date: data.date,
        checklist_template_id: data.checklistTemplateId ?? null,
      })
      .eq("id", data.assignmentId)
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", data.branchId)
      .select(
        `
      id, date, branch_id, employee_id, shift_id,
      checklist_template_id,
      shifts ( id, name, start_time, end_time ),
      shift_checklist_templates ( id, name, branch_id ),
      employees (
        id, employee_code,
        profiles (
          full_name,
          positions ( label_vi )
        )
      )
    `,
      )
      .maybeSingle();

    if (error?.code === "23505") {
      return { success: false, error: "Nhân viên đã có phân ca trong ngày này." };
    }
    if (error || !result) {
      return { success: false, error: "Không thể cập nhật phân ca." };
    }

    revalidateHrSchedulePaths();
    return { success: true, data: result };
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
      id, employee_code, default_checklist_template_id,
      profiles (
        full_name,
        branch_id,
        positions ( label_vi )
      )
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
