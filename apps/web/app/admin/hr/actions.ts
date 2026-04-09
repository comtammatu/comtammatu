"use server";

import { z } from "zod";
import type { StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../_lib/auth";
import { canAccessBranch } from "../_lib/branch-scope";

const HR_ROLES: readonly StaffRole[] = ["owner", "super_manager"];
const SHIFT_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
];

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
  const ctx = await getAuthContext(HR_ROLES);
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

export async function createEmployee(
  input: z.infer<typeof employeeSchema>,
): Promise<ActionResult> {
  const parsed = employeeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(HR_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("employees")
    .insert({
      tenant_id: claims.tenant_id,
      profile_id: parsed.data.profileId,
      employee_code: parsed.data.employeeCode ?? null,
      id_number: parsed.data.idNumber ?? null,
      bank_account: parsed.data.bankAccount ?? null,
      bank_name: parsed.data.bankName ?? null,
      base_salary: parsed.data.baseSalary ?? null,
      start_date: parsed.data.startDate ?? null,
      contract_type: parsed.data.contractType ?? null,
      dependents_count: parsed.data.dependentsCount,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Nhân viên này đã có hồ sơ." };
    }
    return { success: false, error: "Không thể tạo hồ sơ nhân viên." };
  }

  return { success: true, data };
}

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

export async function fetchShifts(branchId: number): Promise<ActionResult> {
  const parsedBranch = z.coerce.number().int().positive().safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const ctx = await getAuthContext(SHIFT_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // Branch scope: branch_manager can only access their own branch
  if (
    claims.user_role === "branch_manager" &&
    claims.branch_id !== parsedBranch.data
  ) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const { data, error } = await supabase
    .from("shifts")
    .select("id, name, start_time, end_time, is_active")
    .eq("branch_id", parsedBranch.data)
    .eq("tenant_id", claims.tenant_id)
    .order("start_time");

  if (error) {
    return { success: false, error: "Không thể tải danh sách ca." };
  }

  return { success: true, data: data ?? [] };
}

export async function createShift(
  input: z.infer<typeof shiftSchema>,
): Promise<ActionResult> {
  const parsed = shiftSchema.safeParse(input);
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

  const { data, error } = await supabase
    .from("shifts")
    .insert({
      tenant_id: claims.tenant_id,
      branch_id: parsed.data.branchId,
      name: parsed.data.name,
      start_time: parsed.data.startTime,
      end_time: parsed.data.endTime,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Ca này đã tồn tại." };
    }
    return { success: false, error: "Không thể tạo ca." };
  }

  return { success: true, data };
}

/* ─── Attendance ─── */

export async function fetchAttendance(
  branchId: number,
  month: string, // 'YYYY-MM'
): Promise<ActionResult> {
  const parsedBranch = z.coerce.number().int().positive().safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);
  const parsedMonth = monthSchema.safeParse(month);
  if (!parsedMonth.success) {
    return { success: false, error: "Tháng không hợp lệ (YYYY-MM)" };
  }

  const ctx = await getAuthContext(SHIFT_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // Branch scope: branch_manager can only access their own branch
  if (
    claims.user_role === "branch_manager" &&
    claims.branch_id !== parsedBranch.data
  ) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const startDate = `${parsedMonth.data}-01`;
  // Calculate end of month
  const [year, mon] = parsedMonth.data.split("-").map(Number);
  const endDate = new Date(year!, mon!, 0).toISOString().split("T")[0];

  const { data, error } = await supabase
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
    .eq("branch_id", parsedBranch.data)
    .eq("tenant_id", claims.tenant_id)
    .gte("date", startDate)
    .lte("date", endDate!)
    .order("date")
    .order("employee_id");

  if (error) {
    return { success: false, error: "Không thể tải bảng chấm công." };
  }

  return { success: true, data: data ?? [] };
}

const checkInSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  employeeId: z.coerce.number().int().positive(),
  shiftId: z.coerce.number().int().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function checkIn(
  input: z.infer<typeof checkInSchema>,
): Promise<ActionResult> {
  const parsed = checkInSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(SHIFT_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (
    claims.user_role === "branch_manager" &&
    claims.branch_id !== parsed.data.branchId
  ) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // Upsert: create attendance record with check_in time
  const { data, error } = await supabase
    .from("attendance_records")
    .upsert(
      {
        tenant_id: claims.tenant_id,
        branch_id: parsed.data.branchId,
        employee_id: parsed.data.employeeId,
        shift_id: parsed.data.shiftId ?? null,
        date: parsed.data.date,
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

  return { success: true, data };
}

export async function checkOut(attendanceId: number): Promise<ActionResult> {
  const parsedId = z.coerce.number().int().positive().safeParse(attendanceId);
  if (!parsedId.success) {
    return { success: false, error: "ID không hợp lệ" };
  }

  const ctx = await getAuthContext(SHIFT_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { error } = await supabase
    .from("attendance_records")
    .update({ check_out: new Date().toISOString() })
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return { success: false, error: "Không thể chấm công ra." };
  }

  return { success: true };
}

/* ─── Attendance Summary ─── */

export async function fetchAttendanceSummary(
  branchId: number,
  month: string,
): Promise<ActionResult> {
  const parsedBranch = z.coerce.number().int().positive().safeParse(branchId);
  const parsedMonth = z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .safeParse(month);
  if (!parsedBranch.success || !parsedMonth.success) {
    return { success: false, error: "Tham số không hợp lệ" };
  }

  const ctx = await getAuthContext(SHIFT_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (
    claims.user_role === "branch_manager" &&
    claims.branch_id !== parsedBranch.data
  ) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const startDate = `${parsedMonth.data}-01`;
  const [year, mon] = parsedMonth.data.split("-").map(Number);
  const endDate = new Date(year!, mon!, 0).toISOString().split("T")[0];

  // Get attendance grouped by employee + status
  const { data, error } = await supabase
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
    .eq("branch_id", parsedBranch.data)
    .eq("tenant_id", claims.tenant_id)
    .gte("date", startDate)
    .lte("date", endDate!);

  if (error) {
    return { success: false, error: "Không thể tải tổng hợp chấm công." };
  }

  // Aggregate per employee
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

  for (const record of data ?? []) {
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
}

/* ─── Update Attendance Status ─── */

const updateAttendanceSchema = z.object({
  attendanceId: z.coerce.number().int().positive(),
  status: z.enum(["present", "absent", "late", "half_day"]),
  note: z.string().optional(),
});

export async function updateAttendanceStatus(
  input: z.infer<typeof updateAttendanceSchema>,
): Promise<ActionResult> {
  const parsed = updateAttendanceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(SHIFT_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { error } = await supabase
    .from("attendance_records")
    .update({
      status: parsed.data.status,
      note: parsed.data.note ?? null,
    })
    .eq("id", parsed.data.attendanceId)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return { success: false, error: "Không thể cập nhật trạng thái." };
  }

  return { success: true };
}

/* ─── Bulk Check-in ─── */

const bulkCheckInSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  employeeIds: z.array(z.coerce.number().int().positive()).min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shiftId: z.coerce.number().int().positive().optional(),
});

export async function bulkCheckIn(
  input: z.infer<typeof bulkCheckInSchema>,
): Promise<ActionResult> {
  const parsed = bulkCheckInSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(SHIFT_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (
    claims.user_role === "branch_manager" &&
    claims.branch_id !== parsed.data.branchId
  ) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const rows = parsed.data.employeeIds.map((employeeId) => ({
    tenant_id: claims.tenant_id,
    branch_id: parsed.data.branchId,
    employee_id: employeeId,
    shift_id: parsed.data.shiftId ?? null,
    date: parsed.data.date,
    check_in: new Date().toISOString(),
    status: "present" as const,
  }));

  const { error } = await supabase
    .from("attendance_records")
    .upsert(rows, { onConflict: "employee_id,date,tenant_id" });

  if (error) {
    return { success: false, error: "Không thể chấm công hàng loạt." };
  }

  return { success: true, meta: { count: rows.length } };
}
