"use server";

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getVNMonthEndDateString } from "@comtammatu/shared/time";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { withAction } from "@/_lib/with-action";
import { canAccessBranch } from "@/_lib/branch-scope";

const HR_ROLES: readonly StaffRole[] = ["owner", "manager"];
const SHIFT_ROLES: readonly StaffRole[] = ["owner", "manager"];

/* ─── Employees ─── */

const employeeSchema = z.object({
  profileId: z.string().uuid(),
  employeeCode: z.string().optional(),
  idNumber: z.string().optional(),
  bankAccount: z.string().optional(),
  bankName: z.string().optional(),
  baseSalary: z.coerce.number().min(0).optional(),
  startDate: z.string().optional(),
  contractType: z.enum(["probation", "fixed_term", "indefinite"]).optional(),
  dependentsCount: z.coerce.number().int().min(0).default(0),
});

export async function fetchEmployees(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    HR_ROLES,
    PERMISSION_KEYS.HR_MANAGE_EMPLOYEE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("employees")
    .select(
      `
      id, employee_code, id_number, bank_account, bank_name,
      base_salary, start_date, contract_type, dependents_count, is_active,
      profiles (
        id, full_name, phone, role, branch_id,
        branches ( name )
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .order("created_at", { ascending: false });

  if (error) {
    return { success: false, error: "Không thể tải danh sách nhân viên." };
  }

  return { success: true, data: data ?? [] };
}

export const createEmployee = withAction(
  { roles: HR_ROLES, schema: employeeSchema },
  async (data, { supabase, claims }) => {
    const { data: result, error } = await supabase
      .from("employees")
      .insert({
        tenant_id: claims.tenant_id,
        profile_id: data.profileId,
        employee_code: data.employeeCode ?? null,
        id_number: data.idNumber ?? null,
        bank_account: data.bankAccount ?? null,
        bank_name: data.bankName ?? null,
        base_salary: data.baseSalary ?? null,
        start_date: data.startDate ?? null,
        contract_type: data.contractType ?? null,
        dependents_count: data.dependentsCount,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: "Nhân viên này đã có hồ sơ." };
      }
      return { success: false, error: "Không thể tạo hồ sơ nhân viên." };
    }

    return { success: true, data: result };
  },
);

/* ─── Shifts ─── */

const shiftSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  name: z.string().min(1, { error: "Tên ca không được để trống" }),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, { error: "Giờ bắt đầu không hợp lệ (HH:MM)" }),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, { error: "Giờ kết thúc không hợp lệ (HH:MM)" }),
});

const fetchShiftsSchema = z.object({
  branchId: z.coerce.number().int().positive(),
});

export const fetchShifts = withAction(
  { roles: SHIFT_ROLES, schema: fetchShiftsSchema },
  async (data, { supabase, claims }) => {
    // Branch scope: a branch-bound manager (branch_id set; former branch_manager)
    // can only access their own branch. Tenant-wide manager is unrestricted.
    if (
      claims.user_role === "manager" &&
      claims.branch_id != null &&
      claims.branch_id !== data.branchId
    ) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    const { data: result, error } = await supabase
      .from("shifts")
      .select("id, name, start_time, end_time, is_active")
      .eq("branch_id", data.branchId)
      .eq("tenant_id", claims.tenant_id)
      .order("start_time");

    if (error) {
      return { success: false, error: "Không thể tải danh sách ca." };
    }

    return { success: true, data: result ?? [] };
  },
);

export const createShift = withAction(
  { roles: SHIFT_ROLES, schema: shiftSchema, requireBranchScope: true },
  async (data, { supabase, claims }) => {
    if (!(await canAccessBranch(supabase, claims, data.branchId))) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    const { data: result, error } = await supabase
      .from("shifts")
      .insert({
        tenant_id: claims.tenant_id,
        branch_id: data.branchId,
        name: data.name,
        start_time: data.startTime,
        end_time: data.endTime,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: "Ca này đã tồn tại." };
      }
      return { success: false, error: "Không thể tạo ca." };
    }

    return { success: true, data: result };
  },
);

/* ─── Attendance ─── */

const fetchAttendanceSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

export const fetchAttendance = withAction(
  { roles: SHIFT_ROLES, schema: fetchAttendanceSchema },
  async (data, { supabase, claims }) => {
    if (
      claims.user_role === "manager" && claims.branch_id != null &&
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
      id, date, check_in, check_out, status, note,
      employee_id,
      employees (
        id, employee_code,
        profiles ( full_name )
      ),
      shifts ( name, start_time, end_time )
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

const checkInSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  employeeId: z.coerce.number().int().positive(),
  shiftId: z.coerce.number().int().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const checkIn = withAction(
  { roles: SHIFT_ROLES, schema: checkInSchema, requireBranchScope: true },
  async (data, { claims }) => {
    if (
      claims.user_role === "manager" && claims.branch_id != null &&
      claims.branch_id !== data.branchId
    ) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    // Service client: direct INSERT on attendance_records is revoked from
    // `authenticated` (migration 20260602009000). This action is already gated
    // by SHIFT_ROLES + the branch-scope check above, so the elevated write is
    // authorised at the action layer.
    const { data: result, error } = await createServiceClient()
      .from("attendance_records")
      .upsert(
        {
          tenant_id: claims.tenant_id,
          branch_id: data.branchId,
          employee_id: data.employeeId,
          shift_id: data.shiftId ?? null,
          date: data.date,
          check_in: new Date().toISOString(),
          status: "present",
        },
        { onConflict: "employee_id,date,tenant_id" },
      )
      .select("id")
      .single();

    if (error) {
      return { success: false, error: "Không thể chấm công vào." };
    }

    return { success: true, data: result };
  },
);

const checkOutSchema = z.object({
  attendanceId: z.coerce.number().int().positive(),
});

export const checkOut = withAction(
  { roles: SHIFT_ROLES, schema: checkOutSchema, requireBranchScope: true },
  async (data, { supabase, claims }) => {
    let query = supabase
      .from("attendance_records")
      .update({ check_out: new Date().toISOString() })
      .eq("id", data.attendanceId)
      .eq("tenant_id", claims.tenant_id);

    // Branch manager can only check out attendance in their own branch
    if (claims.branch_id) {
      query = query.eq("branch_id", claims.branch_id);
    }

    const { data: result, error } = await query.select("id");

    if (error || !result || result.length === 0) {
      return { success: false, error: "Không thể chấm công ra." };
    }

    return { success: true };
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
      claims.user_role === "manager" && claims.branch_id != null &&
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
      employee_id, status,
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

    const summaryMap = new Map<
      number,
      {
        employee_id: number;
        employee_code: string;
        full_name: string;
        present: number;
        late: number;
        absent: number;
        half_day: number;
        total: number;
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
          present: 0,
          late: 0,
          absent: 0,
          half_day: 0,
          total: 0,
        });
      }
      const s = summaryMap.get(empId)!;
      s.total++;
      if (record.status === "present") s.present++;
      else if (record.status === "late") s.late++;
      else if (record.status === "absent") s.absent++;
      else if (record.status === "half_day") s.half_day++;
    }

    return { success: true, data: Array.from(summaryMap.values()) };
  },
);

/* ─── Update Attendance Status ─── */

const updateAttendanceSchema = z.object({
  attendanceId: z.coerce.number().int().positive(),
  status: z.enum(["present", "absent", "late", "half_day"]),
  note: z.string().optional(),
});

export const updateAttendanceStatus = withAction(
  { roles: SHIFT_ROLES, schema: updateAttendanceSchema, requireBranchScope: true },
  async (data, { supabase, claims }) => {
    let query = supabase
      .from("attendance_records")
      .update({
        status: data.status,
        note: data.note ?? null,
      })
      .eq("id", data.attendanceId)
      .eq("tenant_id", claims.tenant_id);

    // Branch manager can only update attendance in their own branch
    if (claims.branch_id) {
      query = query.eq("branch_id", claims.branch_id);
    }

    const { data: result, error } = await query.select("id");

    if (error || !result || result.length === 0) {
      return { success: false, error: "Không thể cập nhật trạng thái." };
    }

    return { success: true };
  },
);

/* ─── Bulk Check-in ─── */

const bulkCheckInSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  employeeIds: z.array(z.coerce.number().int().positive()).min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shiftId: z.coerce.number().int().positive().optional(),
});

export const bulkCheckIn = withAction(
  { roles: SHIFT_ROLES, schema: bulkCheckInSchema, requireBranchScope: true },
  async (data, { claims }) => {
    if (
      claims.user_role === "manager" && claims.branch_id != null &&
      claims.branch_id !== data.branchId
    ) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    const rows = data.employeeIds.map((employeeId) => ({
      tenant_id: claims.tenant_id,
      branch_id: data.branchId,
      employee_id: employeeId,
      shift_id: data.shiftId ?? null,
      date: data.date,
      check_in: new Date().toISOString(),
      status: "present" as const,
    }));

    // Service client: see checkIn — direct INSERT is revoked from
    // `authenticated`; this action is gated by SHIFT_ROLES + branch-scope above.
    const { error } = await createServiceClient()
      .from("attendance_records")
      .upsert(rows, { onConflict: "employee_id,date,tenant_id" });

    if (error) {
      return { success: false, error: "Không thể chấm công hàng loạt." };
    }

    return { success: true, meta: { count: rows.length } };
  },
);
