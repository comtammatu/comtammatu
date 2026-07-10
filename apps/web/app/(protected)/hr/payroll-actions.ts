"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { calculatePayrollEntry } from "@comtammatu/shared/payroll";
import { getVNMonthEndDateString } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { withAction } from "@/_lib/with-action";
import { logAudit } from "@/_lib/audit";
import {
  mapRpcError,
  type RpcErrorMapping,
  type RpcErrorFallback,
} from "@/_lib/rpc-error-map";
import {
  buildCompletedWorkdays,
  calculateAnnualLeaveUsedThroughMonth,
  calculatePayableDays,
  countAnnualLeaveAccruedThroughMonth,
  countOverlapDays,
  splitAnnualLeaveByQuota,
  type LeaveRange,
} from "@lib/hr/payroll-day-math";

const PAYROLL_ROLES: readonly StaffRole[] = ["owner"];
const payrollActionCopy = messages.hr.payroll.server;

/* ─── Fetch Payroll Periods ─── */

export async function fetchPayrollPeriods(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    PAYROLL_ROLES,
    PERMISSION_KEYS.FINANCE_PAYROLL_CALCULATE,
  );
  if (!ctx) return { success: false, error: payrollActionCopy.forbidden };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("payroll_periods")
    .select("*")
    .eq("tenant_id", claims.tenant_id)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .limit(60);

  if (error) {
    console.error("[hr/payroll-actions:fetchPayrollPeriods] Fetch payroll periods error:", error);
    return { success: false, error: payrollActionCopy.periodLoadFailed };
  }

  return { success: true, data: data ?? [] };
}

/* ─── Create Payroll Period ─── */

const createPeriodSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020),
  standardDays: z.coerce.number().positive().max(31),
});

export const createPayrollPeriod = withAction(
  {
    roles: PAYROLL_ROLES,
    schema: createPeriodSchema,
    permission: PERMISSION_KEYS.FINANCE_PAYROLL_CALCULATE,
  },
  async (data, { supabase, claims }) => {
    const { data: result, error } = await supabase
      .from("payroll_periods")
      .insert({
        tenant_id: claims.tenant_id,
        period_month: data.month,
        period_year: data.year,
        standard_days: data.standardDays,
      })
      .select("id, period_month, period_year, standard_days, status")
      .single();

    if (error) {
      console.error("[hr/payroll-actions:createPayrollPeriod] Insert payroll period error:", error);
      if (error.code === "23505") {
        return {
          success: false,
          error: payrollActionCopy.periodExists(data.month, data.year),
        };
      }
      return { success: false, error: payrollActionCopy.createPeriodFailed };
    }

    return { success: true, data: result };
  },
);

/* ─── Fetch / Update Payroll Period ─── */

const periodIdSchema = z.object({
  periodId: z.coerce.number().int().positive(),
});

export const fetchPayrollPeriod = withAction(
  {
    roles: PAYROLL_ROLES,
    schema: periodIdSchema,
    permission: PERMISSION_KEYS.FINANCE_PAYROLL_CALCULATE,
  },
  async (data, { supabase, claims }) => {
    const { data: period, error } = await supabase
      .from("payroll_periods")
      .select(
        "id, period_month, period_year, standard_days, status, approved_at, paid_at",
      )
      .eq("id", data.periodId)
      .eq("tenant_id", claims.tenant_id)
      .single();

    if (error || !period) {
      if (error) {
        console.error("[hr/payroll-actions:fetchPayrollPeriod] Fetch payroll period error:", error);
      }
      return { success: false, error: payrollActionCopy.periodNotFound };
    }

    return { success: true, data: period };
  },
);

const updateStandardDaysSchema = periodIdSchema.extend({
  standardDays: z.coerce.number().positive().max(31),
});

export const updatePayrollPeriodStandardDays = withAction(
  {
    roles: PAYROLL_ROLES,
    schema: updateStandardDaysSchema,
    permission: PERMISSION_KEYS.FINANCE_PAYROLL_CALCULATE,
  },
  async (data, { supabase, claims }) => {
    const { data: updated, error } = await supabase
      .from("payroll_periods")
      .update({ standard_days: data.standardDays })
      .eq("id", data.periodId)
      .eq("tenant_id", claims.tenant_id)
      .in("status", ["draft", "calculated"])
      .select("id, period_month, period_year, standard_days, status")
      .single();

    if (error || !updated) {
      if (error) {
        console.error("[hr/payroll-actions:updatePayrollPeriodStandardDays] Update standard days error:", error);
      }
      return {
        success: false,
        error: payrollActionCopy.standardDaysEditableOnly,
      };
    }

    revalidatePath("/hr/payroll");
    revalidatePath(`/hr/payroll/${data.periodId}`);
    return { success: true, data: updated };
  },
);

/* ─── Calculate Payroll ─── */

const payrollCalcMappings: readonly RpcErrorMapping[] = [
  {
    match: (m, c) =>
      m.includes("forbidden") || m.includes("tenant_mismatch") || c === "42501",
    errorCode: "payroll.calculate.forbidden",
    userMessage: payrollActionCopy.calculate.forbidden,
  },
  {
    match: (m, c) => m.includes("payroll_period_not_found") || c === "P0002",
    errorCode: "payroll.calculate.period_not_found",
    userMessage: payrollActionCopy.calculate.periodNotFound,
  },
  {
    match: (m) => m.includes("payroll_locked"),
    errorCode: "payroll.calculate.locked",
    userMessage: payrollActionCopy.calculate.locked,
  },
  {
    match: (m) => m.includes("invalid_payroll_entries"),
    errorCode: "payroll.calculate.invalid_entries",
    userMessage: payrollActionCopy.calculate.invalidEntries,
  },
];

const payrollCalcFallback: RpcErrorFallback = {
  userMessage: payrollActionCopy.calculate.fallback,
  errorCode: "payroll.calculate.unknown",
};

export const calculatePayroll = withAction(
  {
    roles: PAYROLL_ROLES,
    schema: periodIdSchema,
    permission: PERMISSION_KEYS.FINANCE_PAYROLL_CALCULATE,
  },
  async (data, { supabase, claims }) => {
    // Payroll source: active contract when present; employee row is fallback for old HKD records.
    const { data: period, error: periodErr } = await supabase
      .from("payroll_periods")
      .select("id, period_month, period_year, standard_days, status")
      .eq("id", data.periodId)
      .eq("tenant_id", claims.tenant_id)
      .single();

    if (periodErr || !period) {
      if (periodErr) {
        console.error("[hr/payroll-actions:calculatePayroll] Fetch payroll period error:", periodErr);
      }
      return { success: false, error: payrollActionCopy.calculate.periodNotFound };
    }

    if (period.status !== "draft" && period.status !== "calculated") {
      return {
        success: false,
        error: payrollActionCopy.calculate.locked,
      };
    }

    const year = period.period_year;
    const month = period.period_month;
    const endDate = getVNMonthEndDateString(year, month);
    const standardDays = Number(period.standard_days ?? 0);

    if (standardDays === 0) {
      return {
        success: false,
        error: payrollActionCopy.calculate.missingStandardDays,
      };
    }

    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;

    const { data: employees, error: empErr } = await supabase
      .from("employees")
      .select(
        "id, base_salary, insurance_base_salary, dependents_count, is_active, start_date",
      )
      .eq("tenant_id", claims.tenant_id);

    if (empErr) {
      console.error("[hr/payroll-actions:calculatePayroll] Fetch employees error:", empErr);
      return {
        success: false,
        error: payrollActionCopy.calculate.employeesLoadFailed,
      };
    }

    const activeEmployees = employees.filter((emp) => emp.is_active);
    if (activeEmployees.length === 0) {
      return {
        success: false,
        error: payrollActionCopy.calculate.noActiveEmployees,
      };
    }

    const activeEmployeeIds = activeEmployees.map((emp) => emp.id);

    const { data: contracts, error: contractErr } = await supabase
      .from("employment_contracts")
      .select(
        "employee_id, gross_salary, insurance_base_salary, start_date, end_date, status",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("status", "active")
      .in("employee_id", activeEmployeeIds)
      .lte("start_date", endDate)
      .or(`end_date.is.null,end_date.gte.${startDate}`);

    if (contractErr) {
      console.error("[hr/payroll-actions:calculatePayroll] Fetch employment contracts error:", contractErr);
      return {
        success: false,
        error: payrollActionCopy.calculate.contractsLoadFailed,
      };
    }

    const contractByEmployee = new Map<
      number,
      {
        gross_salary: number;
        insurance_base_salary: number;
        start_date: string;
      }
    >();
    for (const contract of [...(contracts ?? [])].sort((a, b) =>
      b.start_date.localeCompare(a.start_date),
    )) {
      if (!contractByEmployee.has(contract.employee_id)) {
        contractByEmployee.set(contract.employee_id, contract);
      }
    }

    const eligibleEmployees = activeEmployees.filter((emp) => {
      const contract = contractByEmployee.get(emp.id);
      return Number(contract?.gross_salary ?? emp.base_salary ?? 0) > 0;
    });

    if (eligibleEmployees.length === 0) {
      return {
        success: false,
        error: payrollActionCopy.calculate.noEligibleEmployees,
      };
    }

    const { data: attendance, error: attendanceErr } = await supabase
      .from("attendance_records")
      .select("employee_id, date, check_out")
      .eq("tenant_id", claims.tenant_id)
      .gte("date", startDate)
      .lte("date", endDate);

    if (attendanceErr) {
      console.error("[hr/payroll-actions:calculatePayroll] Fetch attendance records error:", attendanceErr);
      return {
        success: false,
        error: payrollActionCopy.calculate.attendanceLoadFailed,
      };
    }

    const employeeIds = eligibleEmployees.map((emp) => emp.id);
    const workdaysByEmployee = buildCompletedWorkdays(
      (attendance ?? []).map((rec) => ({
        employeeId: rec.employee_id,
        date: rec.date,
        checkOut: rec.check_out,
      })),
    );

    const { data: leaveRows, error: leaveErr } = await supabase
      .from("leave_requests")
      .select("employee_id, start_date, end_date, leave_type, status")
      .eq("tenant_id", claims.tenant_id)
      .eq("status", "approved")
      .in("employee_id", employeeIds)
      .lte("start_date", endDate)
      .gte("end_date", `${year}-01-01`);

    if (leaveErr) {
      console.error("[hr/payroll-actions:calculatePayroll] Fetch leave requests error:", leaveErr);
      return {
        success: false,
        error: payrollActionCopy.calculate.leaveLoadFailed,
      };
    }

    const leaveRanges: LeaveRange[] = (leaveRows ?? []).map((leave) => ({
      employeeId: leave.employee_id,
      startDate: leave.start_date,
      endDate: leave.end_date,
      leaveType: leave.leave_type as LeaveRange["leaveType"],
    }));

    const periodLeaveSummary = new Map<
      number,
      { annualLeaveDays: number; unpaidLeaveDays: number }
    >();
    const annualLeavesByEmployee = new Map<number, LeaveRange[]>();
    for (const leave of leaveRanges) {
      const daysInPeriod = countOverlapDays(
        leave.startDate,
        leave.endDate,
        startDate,
        endDate,
      );
      if (daysInPeriod > 0) {
        const current = periodLeaveSummary.get(leave.employeeId) ?? {
          annualLeaveDays: 0,
          unpaidLeaveDays: 0,
        };
        if (leave.leaveType === "annual") {
          current.annualLeaveDays += daysInPeriod;
        } else {
          current.unpaidLeaveDays += daysInPeriod;
        }
        periodLeaveSummary.set(leave.employeeId, current);
      }

      if (leave.leaveType !== "annual") continue;
      const current = annualLeavesByEmployee.get(leave.employeeId) ?? [];
      current.push(leave);
      annualLeavesByEmployee.set(leave.employeeId, current);
    }

    const entries = eligibleEmployees.map((emp) => {
      const workingDays = workdaysByEmployee.get(emp.id) ?? 0;
      const periodLeave = periodLeaveSummary.get(emp.id) ?? {
          annualLeaveDays: 0,
          unpaidLeaveDays: 0,
        };
      const employeeAnnualLeaves = annualLeavesByEmployee.get(emp.id) ?? [];
      const annualSplit = splitAnnualLeaveByQuota({
        entitlementDays: countAnnualLeaveAccruedThroughMonth(
          emp.start_date,
          year,
          month,
        ),
        usedBeforePeriodDays: calculateAnnualLeaveUsedThroughMonth({
          leaves: employeeAnnualLeaves,
          employeeStartDate: emp.start_date,
          year,
          throughMonth: month - 1,
        }),
        annualLeaveDaysInPeriod: periodLeave.annualLeaveDays,
      });
      const paidLeaveDays = annualSplit.paidLeaveDays;
      const unpaidLeaveDays =
        periodLeave.unpaidLeaveDays + annualSplit.overflowLeaveDays;
      const payableDays = calculatePayableDays({
        workingDays,
        paidLeaveDays,
        standardDays,
      });
      const contract = contractByEmployee.get(emp.id);
      const baseSalary = Number(contract?.gross_salary ?? emp.base_salary ?? 0);
      const insuranceBaseSalary = Number(
        contract?.insurance_base_salary ?? emp.insurance_base_salary ?? 0,
      );

      const proratedSalary =
        standardDays > 0
          ? Math.round((baseSalary * payableDays) / standardDays)
          : baseSalary;
      const grossTotal = proratedSalary;

      const result = calculatePayrollEntry({
        grossTotal,
        insuranceBaseSalary,
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
        paid_leave_days: paidLeaveDays,
        unpaid_leave_days: unpaidLeaveDays,
        payable_days: payableDays,
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

    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      "upsert_payroll_calculation",
      { p_period_id: data.periodId, p_entries: entries },
    );

    if (rpcErr) {
      return mapRpcError(rpcErr, payrollCalcMappings, payrollCalcFallback);
    }

    const paidLeaveDaysTotal = entries.reduce(
      (sum, entry) => sum + entry.paid_leave_days,
      0,
    );
    const payableDaysTotal = entries.reduce(
      (sum, entry) => sum + entry.payable_days,
      0,
    );

    return {
      success: true,
      meta: {
        employeeCount: Number(
          (rpcData as { employee_count?: number } | null)?.employee_count ??
            entries.length,
        ),
        paidLeaveDaysTotal,
        payableDaysTotal,
      },
    };
  },
);

/* ─── Fetch Payroll Entries ─── */

const fetchPayrollEntriesSchema = z.object({
  periodId: z.coerce.number().int().positive(),
});

export const fetchPayrollEntries = withAction(
  {
    roles: PAYROLL_ROLES,
    schema: fetchPayrollEntriesSchema,
    permission: PERMISSION_KEYS.FINANCE_PAYROLL_CALCULATE,
  },
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
      console.error("[hr/payroll-actions:fetchPayrollEntries] Fetch payroll entries error:", error);
      return { success: false, error: payrollActionCopy.entriesLoadFailed };
    }

    return { success: true, data: result ?? [] };
  },
);

/* ─── Approve Payroll ─── */

const approvePayrollSchema = z.object({
  periodId: z.coerce.number().int().positive(),
});

export const approvePayroll = withAction(
  {
    roles: ["owner"] as const,
    schema: approvePayrollSchema,
    permission: PERMISSION_KEYS.FINANCE_PAYROLL_APPROVE,
  },
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
      if (error) {
        console.error("[hr/payroll-actions:approvePayroll] Update payroll period to approved error:", error);
      }
      return { success: false, error: payrollActionCopy.approveFailed };
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
  {
    roles: ["owner"] as const,
    schema: markPayrollPaidSchema,
    permission: PERMISSION_KEYS.FINANCE_PAYROLL_APPROVE,
  },
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
      if (error) {
        console.error("[hr/payroll-actions:markPayrollPaid] Update payroll period to paid error:", error);
      }
      return { success: false, error: payrollActionCopy.markPaidFailed };
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
