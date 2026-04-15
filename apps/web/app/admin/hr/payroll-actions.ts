"use server";

import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import { calculatePayrollEntry } from "@comtammatu/shared/payroll";
import { getAuthContext } from "../_lib/auth";
import { withAction } from "@/_lib/with-action";
import { logAudit } from "../_lib/audit";
import type { StaffRole } from "@comtammatu/shared/auth";

const PAYROLL_ROLES: readonly StaffRole[] = ["owner", "super_manager"];

/* ─── Fetch Payroll Periods ─── */

export async function fetchPayrollPeriods(): Promise<ActionResult> {
  const ctx = await getAuthContext(PAYROLL_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("payroll_periods")
    .select("*")
    .eq("tenant_id", claims.tenant_id)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });

  if (error) {
    return { success: false, error: "Không thể tải kỳ lương." };
  }

  return { success: true, data: data ?? [] };
}

/* ─── Create Payroll Period ─── */

const createPeriodSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020),
});

export const createPayrollPeriod = withAction(
  { roles: PAYROLL_ROLES, schema: createPeriodSchema },
  async (data, { supabase, claims }) => {
    const { data: result, error } = await supabase
      .from("payroll_periods")
      .insert({
        tenant_id: claims.tenant_id,
        period_month: data.month,
        period_year: data.year,
      })
      .select("id, period_month, period_year, status")
      .single();

    if (error) {
      if (error.code === "23505") {
        return {
          success: false,
          error: `Kỳ lương ${data.month}/${data.year} đã tồn tại.`,
        };
      }
      return { success: false, error: "Không thể tạo kỳ lương." };
    }

    return { success: true, data: result };
  },
);

/* ─── Calculate Payroll ─── */

const periodIdSchema = z.object({
  periodId: z.coerce.number().int().positive(),
});

export const calculatePayroll = withAction(
  { roles: PAYROLL_ROLES, schema: periodIdSchema },
  async (data, { supabase, claims }) => {
    // Load period
    const { data: period, error: periodErr } = await supabase
      .from("payroll_periods")
      .select("id, period_month, period_year, status")
      .eq("id", data.periodId)
      .eq("tenant_id", claims.tenant_id)
      .single();

    if (periodErr || !period) {
      return { success: false, error: "Kỳ lương không tồn tại." };
    }

    if (period.status !== "draft" && period.status !== "calculated") {
      return {
        success: false,
        error: "Chỉ có thể tính lương cho kỳ nháp hoặc đã tính.",
      };
    }

    // Load active employees
    const { data: employees, error: empErr } = await supabase
      .from("employees")
      .select("id, base_salary, insurance_base_salary, dependents_count")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true);

    if (empErr) {
      return { success: false, error: "Không thể tải danh sách nhân viên." };
    }

    if (!employees || employees.length === 0) {
      return { success: false, error: "Không có nhân viên nào đang hoạt động." };
    }

    // Count working days in month
    const year = period.period_year;
    const month = period.period_month;
    const daysInMonth = new Date(year, month, 0).getDate();

    // Standard working days (exclude weekends — rough estimate: 22)
    let standardDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const day = new Date(year, month - 1, d).getDay();
      if (day !== 0 && day !== 6) standardDays++;
    }

    // Count attendance per employee
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = `${year}-${String(month).padStart(2, "0")}-${daysInMonth}`;

    const { data: attendance, error: attendanceErr } = await supabase
      .from("attendance_records")
      .select("employee_id, status")
      .eq("tenant_id", claims.tenant_id)
      .gte("date", startDate)
      .lte("date", endDate);

    if (attendanceErr) {
      return {
        success: false,
        error: "Không thể tải dữ liệu chấm công. Tính lương bị hủy.",
      };
    }

    // Build attendance map
    const attendanceMap = new Map<number, { present: number; half: number }>();
    for (const rec of attendance ?? []) {
      const cur = attendanceMap.get(rec.employee_id) ?? {
        present: 0,
        half: 0,
      };
      if (rec.status === "present" || rec.status === "late") cur.present++;
      else if (rec.status === "half_day") cur.half++;
      attendanceMap.set(rec.employee_id, cur);
    }

    // Calculate payroll for each employee
    const entries = employees.map((emp) => {
      const att = attendanceMap.get(emp.id) ?? { present: 0, half: 0 };
      const workingDays = att.present + att.half * 0.5;
      const baseSalary = Number(emp.base_salary ?? 0);
      const insuranceBase = Number(emp.insurance_base_salary ?? baseSalary);

      // Pro-rated salary
      const proratedSalary =
        standardDays > 0
          ? Math.round((baseSalary * workingDays) / standardDays)
          : baseSalary;
      const grossTotal = proratedSalary;

      const result = calculatePayrollEntry({
        grossTotal,
        insuranceBaseSalary: insuranceBase,
        taxExemptAllowances: 0,
        dependentCount: emp.dependents_count ?? 0,
        charityDeduction: 0,
        advanceDeduction: 0,
        otherDeductions: 0,
      });

      return {
        tenant_id: claims.tenant_id,
        payroll_period_id: data.periodId,
        employee_id: emp.id,
        working_days: workingDays,
        standard_days: standardDays,
        overtime_hours: 0,
        base_salary: proratedSalary,
        allowances: 0,
        tax_exempt_allowances: 0,
        overtime_pay: 0,
        bonus: 0,
        gross_total: grossTotal,
        bhxh_employee: result.bhxhEmployee,
        bhyt_employee: result.bhytEmployee,
        bhtn_employee: result.bhtnEmployee,
        total_insurance_employee: result.totalInsuranceEmployee,
        bhxh_employer: result.bhxhEmployer,
        bhyt_employer: result.bhytEmployer,
        bhtn_employer: result.bhtnEmployer,
        total_insurance_employer: result.totalInsuranceEmployer,
        personal_deduction: result.personalDeduction,
        dependent_count: emp.dependents_count ?? 0,
        dependent_deduction: result.dependentDeduction,
        charity_deduction: 0,
        taxable_income: result.taxableIncome,
        pit_tax: result.pitTax,
        advance_deduction: 0,
        other_deductions: 0,
        net_salary: result.netSalary,
        insurance_base: result.insuranceBase,
      };
    });

    // Upsert entries (recalculate overwrites previous)
    const { error: upsertErr } = await supabase
      .from("payroll_entries")
      .upsert(entries, {
        onConflict: "payroll_period_id,employee_id,tenant_id",
      });

    if (upsertErr) {
      return { success: false, error: "Không thể lưu bảng lương." };
    }

    // Update period status
    // TODO: migrate to atomic RPC (upsert entries + update status in one transaction)
    const { error: statusErr } = await supabase
      .from("payroll_periods")
      .update({ status: "calculated" })
      .eq("id", data.periodId)
      .eq("tenant_id", claims.tenant_id);

    if (statusErr) {
      return {
        success: false,
        error: "Đã lưu bảng lương nhưng không thể cập nhật trạng thái kỳ lương.",
      };
    }

    return { success: true, meta: { employeeCount: entries.length } };
  },
);

/* ─── Fetch Payroll Entries ─── */

const fetchPayrollEntriesSchema = z.object({
  periodId: z.coerce.number().int().positive(),
});

export const fetchPayrollEntries = withAction(
  { roles: PAYROLL_ROLES, schema: fetchPayrollEntriesSchema },
  async (data, { supabase, claims }) => {
    const { data: result, error } = await supabase
      .from("payroll_entries")
      .select(
        `
      *,
      employees (
        id, employee_code,
        profiles ( full_name )
      )
    `,
      )
      .eq("payroll_period_id", data.periodId)
      .eq("tenant_id", claims.tenant_id)
      .order("employee_id");

    if (error) {
      return { success: false, error: "Không thể tải bảng lương." };
    }

    return { success: true, data: result ?? [] };
  },
);

/* ─── Approve Payroll ─── */

const approvePayrollSchema = z.object({
  periodId: z.coerce.number().int().positive(),
});

export const approvePayroll = withAction(
  { roles: ["owner"] as const, schema: approvePayrollSchema },
  async (data, { supabase, claims, user }) => {
    const { data: updated, error } = await supabase
      .from("payroll_periods")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", data.periodId)
      .eq("tenant_id", claims.tenant_id)
      .eq("status", "calculated")
      .select("id")
      .single();

    if (error || !updated) {
      return { success: false, error: "Không thể duyệt bảng lương." };
    }

    logAudit(supabase, {
      tenantId: claims.tenant_id,
      userId: user.id,
      action: "approve",
      entityType: "payroll_period",
      entityId: data.periodId,
      newData: { status: "approved" },
    });

    // Auto-post GL journal for payroll (non-fatal — payroll approval still succeeds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: glError } = await (supabase as any).rpc(
      "post_payroll_journal",
      {
        p_payroll_period_id: data.periodId,
      },
    );
    if (glError) {
      console.error(
        "[approvePayroll] post_payroll_journal failed:",
        glError.message,
      );
    }

    return { success: true };
  },
);

/* ─── Mark Payroll Paid ─── */

const markPayrollPaidSchema = z.object({
  periodId: z.coerce.number().int().positive(),
});

export const markPayrollPaid = withAction(
  { roles: ["owner"] as const, schema: markPayrollPaidSchema },
  async (data, { supabase, claims, user }) => {
    const { data: updated, error } = await supabase
      .from("payroll_periods")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
      })
      .eq("id", data.periodId)
      .eq("tenant_id", claims.tenant_id)
      .eq("status", "approved")
      .select("id")
      .single();

    if (error || !updated) {
      return { success: false, error: "Không thể đánh dấu đã thanh toán." };
    }

    logAudit(supabase, {
      tenantId: claims.tenant_id,
      userId: user.id,
      action: "pay",
      entityType: "payroll_period",
      entityId: data.periodId,
      newData: { status: "paid" },
    });

    return { success: true };
  },
);
