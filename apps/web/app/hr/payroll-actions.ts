"use server";

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { calculatePayrollEntry } from "@comtammatu/shared/payroll";
import { getAuthContextWithPermission } from "../admin/_lib/auth";
import { withAction } from "@/_lib/with-action";
import { logAudit } from "../admin/_lib/audit";

const PAYROLL_ROLES: readonly StaffRole[] = ["owner", "super_manager"];

/* ─── Fetch Payroll Periods ─── */

export async function fetchPayrollPeriods(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(PAYROLL_ROLES, PERMISSION_KEYS.FINANCE_PAYROLL_CALCULATE);
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

    const year = period.period_year;
    const month = period.period_month;
    const daysInMonth = new Date(year, month, 0).getDate();

    let standardDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const day = new Date(year, month - 1, d).getDay();
      if (day !== 0 && day !== 6) standardDays++;
    }

    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = `${year}-${String(month).padStart(2, "0")}-${daysInMonth}`;

    // Load employees who had any contract overlapping the period.
    // Do NOT filter by is_active — terminated-within-period employees still
    // need their final paycheck (BLLĐ Art 48).
    const { data: employees, error: empErr } = await supabase
      .from("employees")
      .select("id, base_salary, dependents_count")
      .eq("tenant_id", claims.tenant_id);

    if (empErr) {
      return { success: false, error: "Không thể tải danh sách nhân viên." };
    }

    // insurance_base_salary source of truth = employment_contracts active
    // during this period (per labor-contracts.md §5.3). Pick the contract
    // whose start_date ≤ period_end AND (end_date IS NULL OR end_date ≥
    // period_start) — the one with the latest start_date wins for the
    // period's effective rate.
    const { data: contracts, error: contractErr } = await supabase
      .from("employment_contracts")
      .select(
        "employee_id, insurance_base_salary, gross_salary, start_date, end_date, status",
      )
      .eq("tenant_id", claims.tenant_id)
      .lte("start_date", endDate)
      .or(`end_date.is.null,end_date.gte.${startDate}`);

    if (contractErr) {
      return { success: false, error: "Không thể tải hợp đồng lao động." };
    }

    // Map employee_id → applicable contract for this period (latest start_date
    // that's ≤ endDate). Active OR terminated contracts are valid as long as
    // they overlapped the period.
    const contractByEmployee = new Map<
      number,
      {
        insurance_base_salary: number;
        gross_salary: number;
        start_date: string;
      }
    >();
    for (const c of contracts ?? []) {
      const existing = contractByEmployee.get(c.employee_id);
      if (!existing || c.start_date > existing.start_date) {
        contractByEmployee.set(c.employee_id, {
          insurance_base_salary: Number(c.insurance_base_salary ?? 0),
          gross_salary: Number(c.gross_salary ?? 0),
          start_date: c.start_date,
        });
      }
    }

    // Skip employees with no contract overlapping the period — they were
    // not employed during this month.
    const eligibleEmployees = employees.filter((emp) =>
      contractByEmployee.has(emp.id),
    );

    if (eligibleEmployees.length === 0) {
      return {
        success: false,
        error: "Không có nhân viên có hợp đồng trong kỳ này.",
      };
    }

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

    const entries = eligibleEmployees.map((emp) => {
      const att = attendanceMap.get(emp.id) ?? { present: 0, half: 0 };
      const workingDays = att.present + att.half * 0.5;
      const contract = contractByEmployee.get(emp.id)!;
      // Base salary fallback chain: employees.base_salary → contract.gross_salary
      const baseSalary = Number(emp.base_salary ?? contract.gross_salary ?? 0);
      // insurance_base = contract source of truth (NOT employees cache)
      const insuranceBase =
        contract.insurance_base_salary > 0
          ? contract.insurance_base_salary
          : baseSalary;

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
        effectiveDate: endDate,
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

    const { error: upsertErr } = await supabase
      .from("payroll_entries")
      .upsert(entries, {
        onConflict: "payroll_period_id,employee_id,tenant_id",
      });

    if (upsertErr) {
      return { success: false, error: "Không thể lưu bảng lương." };
    }

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
      action: "approve",
      entityType: "payroll_period",
      entityId: data.periodId,
      newData: { status: "approved" },
    });

    return { success: true };
  },
);

/* ─── Mark Payroll Paid ─── */

const markPayrollPaidSchema = z.object({
  periodId: z.coerce.number().int().positive(),
});

export const markPayrollPaid = withAction(
  { roles: ["owner"] as const, schema: markPayrollPaidSchema },
  async (data, { supabase, claims }) => {
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
      action: "pay",
      entityType: "payroll_period",
      entityId: data.periodId,
      newData: { status: "paid" },
    });

    return { success: true };
  },
);
