"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS, STAFF_ROLES, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getVNMonthEndDateString } from "@comtammatu/shared/time";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { getAuthContext, probePermission } from "@/_lib/auth";
import { withAction } from "@/_lib/with-action";

const HR_ROLES: readonly StaffRole[] = ["owner"];
const HR_EMPLOYEE_VIEW_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
];
const SHIFT_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
];
const ATTENDANCE_PHOTO_BUCKET = "attendance-photos";
const ATTENDANCE_PHOTO_SIGNED_URL_TTL_SECONDS = 300;

/* ─── Employees ─── */

// Operational roles must be attached to a real branch site (mirror of
// admin/staff createStaff — keep the two in sync).
const OPS_ROLES: readonly string[] = [
  "cashier",
  "waiter",
  "chef",
  "branch_manager",
];

const createEmployeeAccountSchema = z.object({
  fullName: z.string().trim().min(1, { error: "Họ tên không được để trống" }),
  email: z.string().email({ error: "Email không hợp lệ" }),
  password: z.string().min(8, { error: "Mật khẩu phải có ít nhất 8 ký tự" }),
  phone: z.string().trim().optional(),
  role: z.string().min(1, { error: "Chọn vai trò" }),
  branchId: z.coerce.number().int().positive().optional(),
  employeeCode: z.string().trim().optional(),
  startDate: z.string().optional(),
  defaultChecklistTemplateId: z
    .coerce
    .number()
    .int()
    .positive()
    .nullable()
    .optional(),
});

async function loadChecklistTemplateBranch(
  tenantId: number,
  templateId: number,
): Promise<number | null | undefined> {
  const { data } = await createServiceClient()
    .from("shift_checklist_templates")
    .select("branch_id")
    .eq("tenant_id", tenantId)
    .eq("id", templateId)
    .eq("is_active", true)
    .maybeSingle();

  return data?.branch_id;
}

export async function fetchEmployees(): Promise<ActionResult> {
  const baseCtx = await getAuthContext(HR_EMPLOYEE_VIEW_ROLES);
  if (!baseCtx) return { success: false, error: "Không có quyền" };

  const { claims, user } = baseCtx;
  const canViewEmployeesWithPermission =
    claims.user_role === "branch_manager" ||
    (await Promise.all([
      probePermission(baseCtx, PERMISSION_KEYS.STAFF_MANAGE),
      probePermission(baseCtx, PERMISSION_KEYS.HR_VIEW_EMPLOYEE),
    ])).some(Boolean);
  if (!canViewEmployeesWithPermission) {
    return { success: false, error: "Không có quyền" };
  }

  let branchManagerBranchId = claims.branch_id;
  if (claims.user_role === "branch_manager" && branchManagerBranchId == null) {
    const { data: profileBranch } = await baseCtx.supabase
      .from("profiles")
      .select("branch_id")
      .eq("id", user.id)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle();
    branchManagerBranchId = profileBranch?.branch_id ?? null;
  }

  // Branch manager read path is intentionally service-role backed:
  // 1) supports older role-template states where `hr:view_employee`
  //    has not been backfilled yet,
  // 2) keeps tenant/branch scoping enforced in code for explicit safety.
  const employeeClient =
    claims.user_role === "branch_manager"
      ? createServiceClient()
      : baseCtx.supabase;

  let query = employeeClient
    .from("employees")
    .select(
      `
      id, employee_code, id_number, bank_account, bank_name,
      base_salary, start_date, contract_type, dependents_count, is_active,
      default_checklist_template_id,
      profiles!inner (
        id, full_name, phone, branch_id,
        positions ( label_vi, default_checklist_template_id ),
        branches ( name )
      )
    `,
      )
    .eq("tenant_id", claims.tenant_id)
    .order("created_at", { ascending: false });

  if (claims.user_role === "branch_manager") {
    if (branchManagerBranchId == null) {
      return { success: true, data: [] };
    }
    query = query.eq("profiles.branch_id", branchManagerBranchId);
  }

  const { data, error } = await query;

  if (error) {
    return { success: false, error: "Không thể tải danh sách nhân viên." };
  }

  return { success: true, data: data ?? [] };
}

// One-step onboarding: create the login account (profile auto-created by the
// `handle_new_user` trigger) AND the employee record in one submit. The auth
// user is created via the Auth Admin API, which cannot share a Postgres
// transaction with the employee INSERT, so a post-create failure is rolled back
// by deleting the orphan auth user (cascades to the profile via FK).
export const createEmployeeAccount = withAction(
  { roles: HR_ROLES, schema: createEmployeeAccountSchema },
  async (data, { claims }) => {
    if (!(STAFF_ROLES as readonly string[]).includes(data.role)) {
      return { success: false, error: "Vai trò không hợp lệ." };
    }
    if (data.role === "owner") {
      return { success: false, error: "Không thể tạo tài khoản chủ sở hữu ở đây." };
    }
    if (OPS_ROLES.includes(data.role) && !data.branchId) {
      return { success: false, error: "Vai trò vận hành phải thuộc một chi nhánh." };
    }

    const service = createServiceClient();

    if (data.branchId != null) {
      const { data: branch } = await service
        .from("branches")
        .select("branch_kind")
        .eq("id", data.branchId)
        .eq("tenant_id", claims.tenant_id)
        .maybeSingle();
      if (!branch) {
        return { success: false, error: "Chi nhánh không hợp lệ." };
      }
      if (OPS_ROLES.includes(data.role) && branch.branch_kind !== "branch") {
        return { success: false, error: "Vai trò vận hành cần gắn với chi nhánh." };
      }
    }

    if (data.defaultChecklistTemplateId != null) {
      const templateBranchId = await loadChecklistTemplateBranch(
        claims.tenant_id,
        data.defaultChecklistTemplateId,
      );
      if (templateBranchId === undefined) {
        return {
          success: false,
          error: "Checklist template không tồn tại hoặc đã bị ngưng sử dụng.",
        };
      }
      if (templateBranchId != null && templateBranchId !== (data.branchId ?? null)) {
        return {
          success: false,
          error: "Checklist template không thuộc phạm vi chi nhánh này.",
        };
      }
    }

    const { data: created, error: authError } = await service.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      app_metadata: {
        tenant_id: claims.tenant_id,
        branch_id: data.branchId ?? null,
        role: data.role,
        full_name: data.fullName,
      },
      user_metadata: { full_name: data.fullName },
    });

    if (authError || !created?.user) {
      if (
        authError?.message?.includes("already been registered") ||
        authError?.message?.includes("already exists")
      ) {
        return { success: false, error: "Email này đã được sử dụng." };
      }
      return { success: false, error: "Không thể tạo tài khoản. Vui lòng thử lại." };
    }

    const userId = created.user.id;

    if (data.phone) {
      const { error: phoneError } = await service
        .from("profiles")
        .update({ phone: data.phone })
        .eq("id", userId)
        .eq("tenant_id", claims.tenant_id);
      if (phoneError) {
        await service.auth.admin.deleteUser(userId);
        return { success: false, error: "Không thể lưu số điện thoại." };
      }
    }

    const { data: result, error } = await service
      .from("employees")
      .insert({
        tenant_id: claims.tenant_id,
        profile_id: userId,
        employee_code: data.employeeCode ?? null,
        start_date: data.startDate ?? null,
        dependents_count: 0,
        default_checklist_template_id: data.defaultChecklistTemplateId ?? null,
      })
      .select("id")
      .single();

    if (error || !result) {
      await service.auth.admin.deleteUser(userId);
      if (error?.code === "23505") {
        return { success: false, error: "Mã nhân viên đã tồn tại." };
      }
      return { success: false, error: "Không thể tạo hồ sơ nhân viên." };
    }

    revalidateHrPaths();
    return { success: true, data: result };
  },
);

/* ─── Shifts (global config — D027) ─── */

const shiftSchema = z.object({
  name: z.string().min(1, { error: "Tên ca không được để trống" }),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, { error: "Giờ bắt đầu không hợp lệ (HH:MM)" }),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, { error: "Giờ kết thúc không hợp lệ (HH:MM)" }),
});

const updateShiftSchema = shiftSchema.extend({
  shiftId: z.coerce.number().int().positive(),
  isActive: z.boolean().optional(),
});

const deactivateShiftSchema = z.object({
  shiftId: z.coerce.number().int().positive(),
});

function revalidateHrPaths() {
  revalidatePath("/hr");
  revalidatePath("/employee");
  revalidatePath("/employee/schedule");
}

// Shifts are global (branch_id NULL): one set shared across every branch.
// Service client read/write, gated by role at the action layer — RLS is
// branch-scoped and would not match null-branch rows.
export async function fetchShifts(): Promise<ActionResult> {
  const ctx = await getAuthContext(HR_EMPLOYEE_VIEW_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { data, error } = await createServiceClient()
    .from("shifts")
    .select("id, name, start_time, end_time, is_active")
    .is("branch_id", null)
    .eq("tenant_id", ctx.claims.tenant_id)
    .order("start_time");

  if (error) {
    return { success: false, error: "Không thể tải danh sách ca." };
  }

  return { success: true, data: data ?? [] };
}

export const createShift = withAction(
  { roles: HR_ROLES, schema: shiftSchema },
  async (data, { claims }) => {
    const { data: result, error } = await createServiceClient()
      .from("shifts")
      .insert({
        tenant_id: claims.tenant_id,
        branch_id: null,
        name: data.name,
        start_time: data.startTime,
        end_time: data.endTime,
      })
      .select("id, name, start_time, end_time, is_active")
      .single();

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: "Ca này đã tồn tại." };
      }
      return { success: false, error: "Không thể tạo ca." };
    }

    revalidateHrPaths();
    return { success: true, data: result };
  },
);

export const updateShift = withAction(
  { roles: HR_ROLES, schema: updateShiftSchema },
  async (data, { claims }) => {
    const { data: result, error } = await createServiceClient()
      .from("shifts")
      .update({
        name: data.name,
        start_time: data.startTime,
        end_time: data.endTime,
        is_active: data.isActive ?? true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.shiftId)
      .eq("tenant_id", claims.tenant_id)
      .is("branch_id", null)
      .select("id, name, start_time, end_time, is_active")
      .maybeSingle();

    if (error || !result) {
      return { success: false, error: "Không thể cập nhật ca." };
    }

    revalidateHrPaths();
    return { success: true, data: result };
  },
);

export const deactivateShift = withAction(
  { roles: HR_ROLES, schema: deactivateShiftSchema },
  async (data, { claims }) => {
    const { data: result, error } = await createServiceClient()
      .from("shifts")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.shiftId)
      .eq("tenant_id", claims.tenant_id)
      .is("branch_id", null)
      .select("id, name, start_time, end_time, is_active")
      .maybeSingle();

    if (error || !result) {
      return { success: false, error: "Không thể ngưng dùng ca." };
    }

    revalidateHrPaths();
    return { success: true, data: result };
  },
);

/* ─── Attendance ─── */

const fetchAttendanceSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

const attendancePhotoSchema = z.object({
  attendanceId: z.coerce.number().int().positive(),
});

export const fetchAttendance = withAction(
  { roles: SHIFT_ROLES, schema: fetchAttendanceSchema },
  async (data, { supabase, claims }) => {
    if (
      claims.user_role === "branch_manager" &&
      claims.branch_id !== data.branchId
    ) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    const startDate = `${data.month}-01`;
    const [year, mon] = data.month.split("-").map(Number);
    const endDate = getVNMonthEndDateString(year!, mon!);

    const { data: result, error } = await supabase
      .from("attendance_records")
      .select(
      `
      id, date, check_in, check_out, status, note, check_in_photo_path,
      checklist_template_id,
      employee_id,
      employees (
        id, employee_code,
        profiles ( full_name )
      ),
      shifts ( name, start_time, end_time ),
      shift_checklist_templates ( name ),
      attendance_checklist_items (
        id, title, phase, done_definition, is_required, is_done, sort_order
      )
    `,
      )
      .eq("branch_id", data.branchId)
      .eq("tenant_id", claims.tenant_id)
      .gte("date", startDate)
      .lte("date", endDate!)
      .order("date")
      .order("employee_id");

    if (error) {
      return { success: false, error: "Không thể tải bảng chấm công." };
    }

    return { success: true, data: result ?? [] };
  },
);

export const getAttendancePhotoUrl = withAction(
  { roles: SHIFT_ROLES, schema: attendancePhotoSchema },
  async (data, { supabase, claims }) => {
    let query = supabase
      .from("attendance_records")
      .select("id, branch_id, check_in_photo_path")
      .eq("id", data.attendanceId)
      .eq("tenant_id", claims.tenant_id);

    if (claims.user_role === "branch_manager") {
      if (claims.branch_id == null) {
        return { success: false, error: "Tài khoản chưa được gán chi nhánh." };
      }
      query = query.eq("branch_id", claims.branch_id);
    }

    const { data: record, error } = await query.maybeSingle();

    if (error || !record) {
      return { success: false, error: "Không tìm thấy dòng chấm công." };
    }
    if (!record.check_in_photo_path) {
      return { success: false, error: "Dòng chấm công này chưa có ảnh." };
    }

    const { data: signed, error: signError } = await createServiceClient()
      .storage.from(ATTENDANCE_PHOTO_BUCKET)
      .createSignedUrl(
        record.check_in_photo_path,
        ATTENDANCE_PHOTO_SIGNED_URL_TTL_SECONDS,
      );

    if (signError || !signed) {
      return { success: false, error: "Không thể tạo link xem ảnh." };
    }

    return {
      success: true,
      data: {
        url: signed.signedUrl,
        expires_in: ATTENDANCE_PHOTO_SIGNED_URL_TTL_SECONDS,
      },
    };
  },
);

/* ─── Attendance Summary ─── */

const fetchAttendanceSummarySchema = z.object({
  branchId: z.coerce.number().int().positive(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

export const fetchAttendanceSummary = withAction(
  { roles: SHIFT_ROLES, schema: fetchAttendanceSummarySchema },
  async (data, { supabase, claims }) => {
    if (
      claims.user_role === "branch_manager" &&
      claims.branch_id !== data.branchId
    ) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    const startDate = `${data.month}-01`;
    const [year, mon] = data.month.split("-").map(Number);
    const endDate = getVNMonthEndDateString(year!, mon!);

    const { data: result, error } = await supabase
      .from("attendance_records")
      .select(
        `
      employee_id, date, check_out,
      employees (
        id, employee_code,
        profiles ( full_name )
      )
    `,
      )
      .eq("branch_id", data.branchId)
      .eq("tenant_id", claims.tenant_id)
      .gte("date", startDate)
      .lte("date", endDate!);

    if (error) {
      return { success: false, error: "Không thể tải tổng hợp chấm công." };
    }

    // Per-shift attendance (D027): count shifts per day, then workdays =
    // Σ min(shifts/day, 2) × 0.5 (2 shifts = 1 công, 1 shift = 0.5). open =
    // shifts not yet closed (check_out NULL).
    const summaryMap = new Map<
      number,
      {
        employee_id: number;
        employee_code: string;
        full_name: string;
        days: Map<string, number>;
        open: number;
      }
    >();

    for (const record of result ?? []) {
      const empId = record.employee_id;
      if (!summaryMap.has(empId)) {
        const emp = record.employees as {
          id: number;
          employee_code: string;
          profiles: { full_name: string } | null;
        } | null;
        summaryMap.set(empId, {
          employee_id: empId,
          employee_code: emp?.employee_code ?? "",
          full_name: emp?.profiles?.full_name ?? "",
          days: new Map(),
          open: 0,
        });
      }
      const s = summaryMap.get(empId)!;
      s.days.set(record.date, (s.days.get(record.date) ?? 0) + 1);
      if (!record.check_out) s.open++;
    }

    const summary = Array.from(summaryMap.values()).map((s) => {
      let workdays = 0;
      for (const count of s.days.values()) {
        workdays += Math.min(count, 2) * 0.5;
      }
      return {
        employee_id: s.employee_id,
        employee_code: s.employee_code,
        full_name: s.full_name,
        workdays,
        open: s.open,
      };
    });

    return { success: true, data: summary };
  },
);
