"use server";

import { z } from "zod";
import type { StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../_lib/auth";
import { canAccessBranch } from "../_lib/branch-scope";

const SHIFT_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
];

/* ─── Fetch Shift Assignments for a week ─── */

export async function fetchShiftAssignments(
  branchId: number,
  weekStartDate: string, // 'YYYY-MM-DD' (Monday)
): Promise<ActionResult> {
  const parsedBranch = z.coerce.number().int().positive().safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const parsedDate = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .safeParse(weekStartDate);
  if (!parsedDate.success) {
    return { success: false, error: "Ngày không hợp lệ (YYYY-MM-DD)" };
  }

  const ctx = await getAuthContext(SHIFT_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (!(await canAccessBranch(supabase, claims, parsedBranch.data))) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // Calculate week end (6 days after start = Sunday)
  const start = new Date(parsedDate.data);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const weekEndDate = end.toISOString().split("T")[0];

  const { data, error } = await supabase
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
    .eq("branch_id", parsedBranch.data)
    .eq("tenant_id", claims.tenant_id)
    .gte("date", parsedDate.data)
    .lte("date", weekEndDate!);

  if (error) {
    return { success: false, error: "Không thể tải phân ca." };
  }

  return { success: true, data: data ?? [] };
}

/* ─── Create Shift Assignment ─── */

const createAssignmentSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  employeeId: z.coerce.number().int().positive(),
  shiftId: z.coerce.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function createShiftAssignment(
  input: z.infer<typeof createAssignmentSchema>,
): Promise<ActionResult> {
  const parsed = createAssignmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(SHIFT_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (!(await canAccessBranch(supabase, claims, parsed.data.branchId))) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // Check for duplicate: same employee + same date + same shift
  const { data: existing } = await supabase
    .from("shift_assignments")
    .select("id")
    .eq("tenant_id", claims.tenant_id)
    .eq("employee_id", parsed.data.employeeId)
    .eq("shift_id", parsed.data.shiftId)
    .eq("date", parsed.data.date)
    .maybeSingle();

  if (existing) {
    return {
      success: false,
      error: "Nhân viên đã được phân ca này trong ngày.",
    };
  }

  const { data, error } = await supabase
    .from("shift_assignments")
    .insert({
      tenant_id: claims.tenant_id,
      branch_id: parsed.data.branchId,
      employee_id: parsed.data.employeeId,
      shift_id: parsed.data.shiftId,
      date: parsed.data.date,
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

  return { success: true, data };
}

/* ─── Delete Shift Assignment ─── */

export async function deleteShiftAssignment(
  assignmentId: number,
): Promise<ActionResult> {
  const parsedId = z.coerce.number().int().positive().safeParse(assignmentId);
  if (!parsedId.success) {
    return { success: false, error: "ID không hợp lệ" };
  }

  const ctx = await getAuthContext(SHIFT_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { error } = await supabase
    .from("shift_assignments")
    .delete()
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return { success: false, error: "Không thể xóa phân ca." };
  }

  return { success: true };
}

/* ─── Fetch Active Employees for Branch ─── */

export async function fetchEmployeesForBranch(
  branchId: number,
): Promise<ActionResult> {
  const parsedBranch = z.coerce.number().int().positive().safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const ctx = await getAuthContext(SHIFT_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (!(await canAccessBranch(supabase, claims, parsedBranch.data))) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const { data, error } = await supabase
    .from("employees")
    .select(
      `
      id, employee_code,
      profiles ( full_name, branch_id )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .eq("profiles.branch_id", parsedBranch.data);

  if (error) {
    return { success: false, error: "Không thể tải danh sách nhân viên." };
  }

  // Filter out employees whose profile didn't match the branch join
  const filtered = (data ?? []).filter((e) => e.profiles !== null);

  return { success: true, data: filtered };
}
