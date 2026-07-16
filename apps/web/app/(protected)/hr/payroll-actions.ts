"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { calculatePayrollEntry } from "@comtammatu/shared/payroll";
import { getVNMonthEndDateString } from "@comtammatu/shared/time";
import type { ActionResult } from "@comtammatu/shared/types";
import { messages } from "@lib/messages";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { withAction } from "@/_lib/with-action";
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

const payrollMonthSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020),
  standardDays: z.coerce.number().positive().max(31),
  branchId: z.coerce.number().int().positive().nullable().optional(),
});

const periodIdSchema = z.object({
  periodId: z.coerce.number().int().positive(),
});

const payrollAdjustmentKindSchema = z.enum([
  "bonus",
  "taxable_allowance",
  "tax_exempt_allowance",
  "advance",
  "deduction",
]);

const payrollAdjustmentSchema = z.object({
  adjustmentId: z.coerce.number().int().positive().optional(),
  employeeId: z.coerce.number().int().positive(),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020),
  kind: payrollAdjustmentKindSchema,
  amount: z.coerce.number().positive().max(1_000_000_000),
  note: z.string().trim().max(500).optional(),
});

const deletePayrollAdjustmentSchema = z.object({
  adjustmentId: z.coerce.number().int().positive(),
});

type PayrollMonthInput = z.infer<typeof payrollMonthSchema>;

type PayrollSupabase = NonNullable<
  Awaited<ReturnType<typeof getAuthContextWithPermission>>
>["supabase"];

interface PayrollContext {
  supabase: PayrollSupabase;
  claims: { tenant_id: number };
}

export type PayrollAdjustmentKind = z.infer<
  typeof payrollAdjustmentKindSchema
>;

export interface PayrollAdjustment {
  id: number;
  kind: PayrollAdjustmentKind;
  amount: number;
  note: string | null;
}

export interface PayrollFinalizedEntry {
  workingDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  payableDays: number;
  taxableAllowances: number;
  taxExemptAllowances: number;
  bonus: number;
  advanceDeduction: number;
  otherDeductions: number;
  grossTotal: number;
  totalInsuranceEmployee: number;
  pitTax: number;
  netSalary: number;
}

export interface PayrollPreviewEntry {
  employeeId: number;
  employeeCode: string | null;
  employeeName: string;
  branchId: number | null;
  branchName: string | null;
  positionLabel: string | null;
  salarySource: "contract" | "employee" | "missing";
  monthlySalary: number;
  workingDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  payableDays: number;
  standardDays: number;
  proratedSalary: number;
  taxableAllowances: number;
  taxExemptAllowances: number;
  bonus: number;
  advanceDeduction: number;
  otherDeductions: number;
  grossTotal: number;
  bhxhEmployee: number;
  bhytEmployee: number;
  bhtnEmployee: number;
  totalInsuranceEmployee: number;
  bhxhEmployer: number;
  bhytEmployer: number;
  bhtnEmployer: number;
  totalInsuranceEmployer: number;
  personalDeduction: number;
  dependentDeduction: number;
  taxableIncome: number;
  pitTax: number;
  expectedNet: number;
  insuranceBase: number;
  dependentsCount: number;
  adjustments: PayrollAdjustment[];
  finalized: PayrollFinalizedEntry | null;
}

export interface PayrollPreview {
  year: number;
  month: number;
  standardDays: number;
  snapshot: {
    id: number;
    status: string;
    approvedAt: string | null;
    paidAt: string | null;
  } | null;
  entries: PayrollPreviewEntry[];
  missingSalaryEmployeeIds: number[];
  canSnapshot: boolean;
}

function firstDayOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function numberValue(value: number | null | undefined): number {
  return Number(value ?? 0);
}

function emptyAdjustmentTotals() {
  return {
    taxableAllowances: 0,
    taxExemptAllowances: 0,
    bonus: 0,
    advanceDeduction: 0,
    otherDeductions: 0,
  };
}

function mapPayrollRpcError(
  error: { code?: string | null; message?: string | null },
  fallback: string,
): string {
  const message = error.message?.toLowerCase() ?? "";
  if (error.code === "42501" || message.includes("missing payroll permission")) {
    return payrollActionCopy.forbidden;
  }
  if (error.code === "P0002" || message.includes("not found")) {
    return payrollActionCopy.adjustmentNotFound;
  }
  if (error.code === "23514" || message.includes("snapshot locked")) {
    return payrollActionCopy.snapshotLocked;
  }
  return fallback;
}

async function buildPayrollPreview(
  input: PayrollMonthInput,
  { supabase, claims }: PayrollContext,
): Promise<ActionResult<PayrollPreview>> {
  const startDate = firstDayOfMonth(input.year, input.month);
  const endDate = getVNMonthEndDateString(input.year, input.month);

  let employeesQuery = supabase
    .from("employees")
    .select(
      `
        id, employee_code, base_salary, insurance_base_salary,
        dependents_count, is_active, start_date,
        profiles!inner (
          full_name, branch_id,
          positions ( label_vi ),
          branches ( name )
        )
      `,
    )
    .eq("tenant_id", claims.tenant_id)
    .order("employee_code");

  if (input.branchId != null) {
    employeesQuery = employeesQuery.eq("profiles.branch_id", input.branchId);
  }

  const { data: employees, error: employeesError } = await employeesQuery;
  if (employeesError) {
    console.error(
      "[hr/payroll-actions:buildPayrollPreview] employees query failed",
      employeesError.code,
    );
    return { success: false, error: payrollActionCopy.calculate.employeesLoadFailed };
  }

  const employeeRows = employees ?? [];
  const employeeIds = employeeRows.map((employee) => employee.id);
  const [contractsResult, attendanceResult, leaveResult, adjustmentsResult, periodResult] =
    await Promise.all([
      supabase
        .from("employment_contracts")
        .select(
          "employee_id, gross_salary, insurance_base_salary, start_date, end_date",
        )
        .eq("tenant_id", claims.tenant_id)
        .eq("status", "active")
        .in("employee_id", employeeIds)
        .lte("start_date", endDate)
        .or(`end_date.is.null,end_date.gte.${startDate}`),
      (() => {
        let query = supabase
          .from("attendance_records")
          .select("employee_id, date, check_out")
          .eq("tenant_id", claims.tenant_id)
          .in("employee_id", employeeIds)
          .gte("date", startDate)
          .lte("date", endDate);
        if (input.branchId != null) query = query.eq("branch_id", input.branchId);
        return query;
      })(),
      supabase
        .from("leave_requests")
        .select("employee_id, start_date, end_date, leave_type")
        .eq("tenant_id", claims.tenant_id)
        .eq("status", "approved")
        .in("employee_id", employeeIds)
        .lte("start_date", endDate)
        .gte("end_date", `${input.year}-01-01`),
      supabase
        .from("payroll_adjustments")
        .select("id, employee_id, kind, amount, note")
        .eq("tenant_id", claims.tenant_id)
        .eq("effective_month", startDate)
        .in("employee_id", employeeIds)
        .order("id"),
      supabase
        .from("payroll_periods")
        .select("id, status, approved_at, paid_at")
        .eq("tenant_id", claims.tenant_id)
        .eq("period_year", input.year)
        .eq("period_month", input.month)
        .maybeSingle(),
    ]);

  if (contractsResult.error) {
    console.error(
      "[hr/payroll-actions:buildPayrollPreview] contracts query failed",
      contractsResult.error.code,
    );
    return { success: false, error: payrollActionCopy.calculate.contractsLoadFailed };
  }
  if (attendanceResult.error) {
    console.error(
      "[hr/payroll-actions:buildPayrollPreview] attendance query failed",
      attendanceResult.error.code,
    );
    return { success: false, error: payrollActionCopy.calculate.attendanceLoadFailed };
  }
  if (leaveResult.error) {
    console.error(
      "[hr/payroll-actions:buildPayrollPreview] leave query failed",
      leaveResult.error.code,
    );
    return { success: false, error: payrollActionCopy.calculate.leaveLoadFailed };
  }
  if (adjustmentsResult.error) {
    console.error(
      "[hr/payroll-actions:buildPayrollPreview] adjustments query failed",
      adjustmentsResult.error.code,
    );
    return { success: false, error: payrollActionCopy.adjustmentsLoadFailed };
  }
  if (periodResult.error) {
    console.error(
      "[hr/payroll-actions:buildPayrollPreview] payroll period query failed",
      periodResult.error.code,
    );
    return { success: false, error: payrollActionCopy.periodLoadFailed };
  }

  const snapshot = periodResult.data
    ? {
        id: periodResult.data.id,
        status: periodResult.data.status,
        approvedAt: periodResult.data.approved_at,
        paidAt: periodResult.data.paid_at,
      }
    : null;
  const snapshotLocked = snapshot?.status === "approved" || snapshot?.status === "paid";
  const finalizedByEmployee = new Map<number, PayrollFinalizedEntry>();
  if (snapshotLocked && snapshot) {
    const { data: finalizedEntries, error: finalizedEntriesError } = await supabase
      .from("payroll_entries")
      .select(
        "employee_id, working_days, paid_leave_days, unpaid_leave_days, payable_days, allowances, tax_exempt_allowances, bonus, total_insurance_employee, pit_tax, advance_deduction, other_deductions, gross_total, net_salary",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("payroll_period_id", snapshot.id);
    if (finalizedEntriesError) {
      console.error(
        "[hr/payroll-actions:buildPayrollPreview] finalized entries query failed",
        finalizedEntriesError.code,
      );
      return { success: false, error: payrollActionCopy.entriesLoadFailed };
    }
    for (const entry of finalizedEntries ?? []) {
      finalizedByEmployee.set(entry.employee_id, {
        workingDays: numberValue(entry.working_days),
        paidLeaveDays: numberValue(entry.paid_leave_days),
        unpaidLeaveDays: numberValue(entry.unpaid_leave_days),
        payableDays: numberValue(entry.payable_days),
        taxableAllowances: numberValue(entry.allowances),
        taxExemptAllowances: numberValue(entry.tax_exempt_allowances),
        bonus: numberValue(entry.bonus),
        advanceDeduction: numberValue(entry.advance_deduction),
        otherDeductions: numberValue(entry.other_deductions),
        grossTotal: numberValue(entry.gross_total),
        totalInsuranceEmployee: numberValue(entry.total_insurance_employee),
        pitTax: numberValue(entry.pit_tax),
        netSalary: numberValue(entry.net_salary),
      });
    }
  }

  const contractByEmployee = new Map<
    number,
    { gross_salary: number; insurance_base_salary: number; start_date: string }
  >();
  for (const contract of [...(contractsResult.data ?? [])].sort((left, right) =>
    right.start_date.localeCompare(left.start_date),
  )) {
    if (!contractByEmployee.has(contract.employee_id)) {
      contractByEmployee.set(contract.employee_id, contract);
    }
  }

  const workdaysByEmployee = buildCompletedWorkdays(
    (attendanceResult.data ?? []).map((record) => ({
      employeeId: record.employee_id,
      date: record.date,
      checkOut: record.check_out,
    })),
  );

  const leaveRanges: LeaveRange[] = (leaveResult.data ?? []).map((leave) => ({
    employeeId: leave.employee_id,
    startDate: leave.start_date,
    endDate: leave.end_date,
    leaveType: leave.leave_type as LeaveRange["leaveType"],
  }));
  const leaveByEmployee = new Map<
    number,
    { annualLeaveDays: number; unpaidLeaveDays: number; annualLeaves: LeaveRange[] }
  >();
  for (const leave of leaveRanges) {
    const current = leaveByEmployee.get(leave.employeeId) ?? {
      annualLeaveDays: 0,
      unpaidLeaveDays: 0,
      annualLeaves: [],
    };
    const daysInPeriod = countOverlapDays(
      leave.startDate,
      leave.endDate,
      startDate,
      endDate,
    );
    if (daysInPeriod > 0) {
      if (leave.leaveType === "annual") current.annualLeaveDays += daysInPeriod;
      else current.unpaidLeaveDays += daysInPeriod;
    }
    if (leave.leaveType === "annual") current.annualLeaves.push(leave);
    leaveByEmployee.set(leave.employeeId, current);
  }

  const adjustmentsByEmployee = new Map<number, PayrollAdjustment[]>();
  for (const row of adjustmentsResult.data ?? []) {
    const adjustment: PayrollAdjustment = {
      id: row.id,
      kind: row.kind as PayrollAdjustmentKind,
      amount: numberValue(row.amount),
      note: row.note,
    };
    const current = adjustmentsByEmployee.get(row.employee_id) ?? [];
    current.push(adjustment);
    adjustmentsByEmployee.set(row.employee_id, current);
  }

  const employeesForPreview = snapshotLocked
    ? employeeRows.filter((employee) => finalizedByEmployee.has(employee.id))
    : employeeRows.filter((employee) => employee.is_active);

  const entries = employeesForPreview.map((employee) => {
    const contract = contractByEmployee.get(employee.id);
    const monthlySalary = numberValue(contract?.gross_salary ?? employee.base_salary);
    const salarySource = contract
      ? "contract"
      : monthlySalary > 0
        ? "employee"
        : "missing";
    const insuranceBaseSalary = numberValue(
      contract?.insurance_base_salary ?? employee.insurance_base_salary,
    );
    const workdays = workdaysByEmployee.get(employee.id) ?? 0;
    const leave = leaveByEmployee.get(employee.id) ?? {
      annualLeaveDays: 0,
      unpaidLeaveDays: 0,
      annualLeaves: [],
    };
    const annualSplit = splitAnnualLeaveByQuota({
      entitlementDays: countAnnualLeaveAccruedThroughMonth(
        employee.start_date,
        input.year,
        input.month,
      ),
      usedBeforePeriodDays: calculateAnnualLeaveUsedThroughMonth({
        leaves: leave.annualLeaves,
        employeeStartDate: employee.start_date,
        year: input.year,
        throughMonth: input.month - 1,
      }),
      annualLeaveDaysInPeriod: leave.annualLeaveDays,
    });
    const paidLeaveDays = annualSplit.paidLeaveDays;
    const unpaidLeaveDays = leave.unpaidLeaveDays + annualSplit.overflowLeaveDays;
    const payableDays = calculatePayableDays({
      workingDays: workdays,
      paidLeaveDays,
      standardDays: input.standardDays,
    });
    const proratedSalary = Math.round(
      (monthlySalary * payableDays) / input.standardDays,
    );
    const adjustments = adjustmentsByEmployee.get(employee.id) ?? [];
    const adjustmentTotals = adjustments.reduce((total, adjustment) => {
      if (adjustment.kind === "bonus") total.bonus += adjustment.amount;
      if (adjustment.kind === "taxable_allowance") {
        total.taxableAllowances += adjustment.amount;
      }
      if (adjustment.kind === "tax_exempt_allowance") {
        total.taxExemptAllowances += adjustment.amount;
      }
      if (adjustment.kind === "advance") total.advanceDeduction += adjustment.amount;
      if (adjustment.kind === "deduction") total.otherDeductions += adjustment.amount;
      return total;
    }, emptyAdjustmentTotals());
    const grossTotal =
      proratedSalary + adjustmentTotals.taxableAllowances + adjustmentTotals.bonus;
    const calculation = calculatePayrollEntry({
      grossTotal,
      insuranceBaseSalary,
      taxExemptAllowances: adjustmentTotals.taxExemptAllowances,
      dependentCount: employee.dependents_count ?? 0,
      charityDeduction: 0,
      advanceDeduction: adjustmentTotals.advanceDeduction,
      otherDeductions: adjustmentTotals.otherDeductions,
      effectiveDate: endDate,
    });
    const profile = employee.profiles;

    return {
      employeeId: employee.id,
      employeeCode: employee.employee_code,
      employeeName: profile?.full_name ?? "—",
      branchId: profile?.branch_id ?? null,
      branchName: profile?.branches?.name ?? null,
      positionLabel: profile?.positions?.label_vi ?? null,
      salarySource,
      monthlySalary,
      workingDays: workdays,
      paidLeaveDays,
      unpaidLeaveDays,
      payableDays,
      standardDays: input.standardDays,
      proratedSalary,
      taxableAllowances: adjustmentTotals.taxableAllowances,
      taxExemptAllowances: adjustmentTotals.taxExemptAllowances,
      bonus: adjustmentTotals.bonus,
      advanceDeduction: adjustmentTotals.advanceDeduction,
      otherDeductions: adjustmentTotals.otherDeductions,
      grossTotal,
      bhxhEmployee: calculation.bhxhEmployee,
      bhytEmployee: calculation.bhytEmployee,
      bhtnEmployee: calculation.bhtnEmployee,
      totalInsuranceEmployee: calculation.totalInsuranceEmployee,
      bhxhEmployer: calculation.bhxhEmployer,
      bhytEmployer: calculation.bhytEmployer,
      bhtnEmployer: calculation.bhtnEmployer,
      totalInsuranceEmployer: calculation.totalInsuranceEmployer,
      personalDeduction: calculation.personalDeduction,
      dependentDeduction: calculation.dependentDeduction,
      taxableIncome: calculation.taxableIncome,
      pitTax: calculation.pitTax,
      expectedNet: calculation.netSalary,
      insuranceBase: calculation.insuranceBase,
      dependentsCount: employee.dependents_count ?? 0,
      adjustments,
      finalized: finalizedByEmployee.get(employee.id) ?? null,
    } satisfies PayrollPreviewEntry;
  });

  const missingSalaryEmployeeIds = snapshotLocked
    ? []
    : entries
        .filter((entry) => entry.salarySource === "missing")
        .map((entry) => entry.employeeId);
  return {
    success: true,
    data: {
      year: input.year,
      month: input.month,
      standardDays: input.standardDays,
      snapshot,
      entries,
      missingSalaryEmployeeIds,
      canSnapshot:
        input.branchId == null &&
        entries.length > 0 &&
        missingSalaryEmployeeIds.length === 0 &&
        !snapshotLocked,
    },
  };
}

export const fetchPayrollPreview = withAction(
  {
    roles: PAYROLL_ROLES,
    schema: payrollMonthSchema,
    permission: PERMISSION_KEYS.FINANCE_PAYROLL_CALCULATE,
  },
  async (data, context) => buildPayrollPreview(data, context),
);

export const savePayrollAdjustment = withAction(
  {
    roles: PAYROLL_ROLES,
    schema: payrollAdjustmentSchema,
    permission: PERMISSION_KEYS.FINANCE_PAYROLL_CALCULATE,
  },
  async (data, { supabase }) => {
    const { data: adjustmentId, error } = await supabase.rpc(
      "upsert_payroll_adjustment",
      {
        p_adjustment_id: data.adjustmentId,
        p_employee_id: data.employeeId,
        p_effective_month: firstDayOfMonth(data.year, data.month),
        p_kind: data.kind,
        p_amount: data.amount,
        p_note: data.note || undefined,
      },
    );
    if (error || adjustmentId == null) {
      if (error) {
        console.error(
          "[hr/payroll-actions:savePayrollAdjustment] adjustment RPC failed",
          error.code,
        );
      }
      return {
        success: false,
        error: error
          ? mapPayrollRpcError(error, payrollActionCopy.adjustmentSaveFailed)
          : payrollActionCopy.adjustmentSaveFailed,
      };
    }

    revalidatePath("/hr/payroll");
    return { success: true, data: { id: adjustmentId } };
  },
);

export const removePayrollAdjustment = withAction(
  {
    roles: PAYROLL_ROLES,
    schema: deletePayrollAdjustmentSchema,
    permission: PERMISSION_KEYS.FINANCE_PAYROLL_CALCULATE,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc("delete_payroll_adjustment", {
      p_adjustment_id: data.adjustmentId,
    });
    if (error) {
      console.error(
        "[hr/payroll-actions:removePayrollAdjustment] adjustment RPC failed",
        error.code,
      );
      return {
        success: false,
        error: mapPayrollRpcError(error, payrollActionCopy.adjustmentDeleteFailed),
      };
    }

    revalidatePath("/hr/payroll");
    return { success: true };
  },
);

export const snapshotPayrollPreview = withAction(
  {
    roles: PAYROLL_ROLES,
    schema: payrollMonthSchema,
    permission: PERMISSION_KEYS.FINANCE_PAYROLL_CALCULATE,
  },
  async (data, context) => {
    if (data.branchId != null) {
      return {
        success: false,
        error: messages.hr.payroll.live.snapshotAllBranchesRequired,
      };
    }
    const previewResult = await buildPayrollPreview(data, context);
    if (!previewResult.success || !previewResult.data) {
      return {
        success: false,
        error: previewResult.error ?? payrollActionCopy.snapshotFailed,
      };
    }

    const preview = previewResult.data;
    if (preview.missingSalaryEmployeeIds.length > 0) {
      return {
        success: false,
        error: payrollActionCopy.snapshotMissingSalary,
      };
    }
    if (!preview.canSnapshot) {
      return {
        success: false,
        error:
          preview.snapshot?.status === "approved" || preview.snapshot?.status === "paid"
            ? payrollActionCopy.snapshotPaymentOwnedByFinance
            : payrollActionCopy.snapshotUnavailable,
      };
    }

    const entries = preview.entries.map((entry) => ({
      employee_id: entry.employeeId,
      working_days: entry.workingDays,
      paid_leave_days: entry.paidLeaveDays,
      unpaid_leave_days: entry.unpaidLeaveDays,
      payable_days: entry.payableDays,
      standard_days: entry.standardDays,
      overtime_hours: 0,
      base_salary: entry.proratedSalary,
      allowances: entry.taxableAllowances,
      tax_exempt_allowances: entry.taxExemptAllowances,
      overtime_pay: 0,
      bonus: entry.bonus,
      gross_total: entry.grossTotal,
      bhxh_employee: entry.bhxhEmployee,
      bhyt_employee: entry.bhytEmployee,
      bhtn_employee: entry.bhtnEmployee,
      total_insurance_employee: entry.totalInsuranceEmployee,
      bhxh_employer: entry.bhxhEmployer,
      bhyt_employer: entry.bhytEmployer,
      bhtn_employer: entry.bhtnEmployer,
      total_insurance_employer: entry.totalInsuranceEmployer,
      personal_deduction: entry.personalDeduction,
      dependent_count: entry.dependentsCount,
      dependent_deduction: entry.dependentDeduction,
      charity_deduction: 0,
      taxable_income: entry.taxableIncome,
      pit_tax: entry.pitTax,
      advance_deduction: entry.advanceDeduction,
      other_deductions: entry.otherDeductions,
      net_salary: entry.expectedNet,
      insurance_base: entry.insuranceBase,
    }));

    const { data: snapshot, error } = await context.supabase.rpc(
      "snapshot_payroll_calculation",
      {
        p_period_year: data.year,
        p_period_month: data.month,
        p_standard_days: data.standardDays,
        p_entries: entries,
      },
    );
    if (error || !snapshot) {
      if (error) {
        console.error(
          "[hr/payroll-actions:snapshotPayrollPreview] snapshot RPC failed",
          error.code,
        );
      }
      return {
        success: false,
        error: error
          ? mapPayrollRpcError(error, payrollActionCopy.snapshotFailed)
          : payrollActionCopy.snapshotFailed,
      };
    }

    revalidatePath("/hr/payroll");
    return { success: true, data: snapshot };
  },
);

export async function fetchPayrollBranches(): Promise<
  ActionResult<Array<{ id: number; name: string }>>
> {
  const context = await getAuthContextWithPermission(
    PAYROLL_ROLES,
    PERMISSION_KEYS.FINANCE_PAYROLL_CALCULATE,
  );
  if (!context) return { success: false, error: payrollActionCopy.forbidden };

  const { data, error } = await context.supabase
    .from("branches")
    .select("id, name")
    .eq("tenant_id", context.claims.tenant_id)
    .eq("is_active", true)
    .order("name");
  if (error) {
    console.error(
      "[hr/payroll-actions:fetchPayrollBranches] branches query failed",
      error.code,
    );
    return { success: false, error: payrollActionCopy.branchesLoadFailed };
  }
  return { success: true, data: data ?? [] };
}

export async function fetchPayrollPeriods(): Promise<ActionResult> {
  const context = await getAuthContextWithPermission(
    PAYROLL_ROLES,
    PERMISSION_KEYS.FINANCE_PAYROLL_CALCULATE,
  );
  if (!context) return { success: false, error: payrollActionCopy.forbidden };

  const { data, error } = await context.supabase
    .from("payroll_periods")
    .select("id, period_month, period_year, standard_days, status, approved_at, paid_at")
    .eq("tenant_id", context.claims.tenant_id)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .limit(60);
  if (error) {
    console.error(
      "[hr/payroll-actions:fetchPayrollPeriods] periods query failed",
      error.code,
    );
    return { success: false, error: payrollActionCopy.periodLoadFailed };
  }
  return { success: true, data: data ?? [] };
}

export const fetchPayrollPeriod = withAction(
  {
    roles: PAYROLL_ROLES,
    schema: periodIdSchema,
    permission: PERMISSION_KEYS.FINANCE_PAYROLL_CALCULATE,
  },
  async (data, { supabase, claims }) => {
    const { data: period, error } = await supabase
      .from("payroll_periods")
      .select("id, period_month, period_year, standard_days, status, approved_at, paid_at")
      .eq("id", data.periodId)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle();
    if (error || !period) {
      if (error) {
        console.error(
          "[hr/payroll-actions:fetchPayrollPeriod] period query failed",
          error.code,
        );
      }
      return { success: false, error: payrollActionCopy.periodNotFound };
    }
    return { success: true, data: period };
  },
);
