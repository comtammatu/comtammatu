"use server";

import { z } from "zod";
import type { StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../_lib/auth";

const REPORT_ROLES: readonly StaffRole[] = ["owner", "super_manager"];

/* ─── Annual Payroll Summary (for PIT filing) ─── */

export async function generatePayrollSummary(
  year: number,
): Promise<ActionResult> {
  const parsedYear = z.coerce.number().int().min(2020).safeParse(year);
  if (!parsedYear.success) {
    return { success: false, error: "Năm không hợp lệ" };
  }

  const ctx = await getAuthContext(REPORT_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // Get all paid periods for the year
  const { data: periods } = await supabase
    .from("payroll_periods")
    .select("id")
    .eq("tenant_id", claims.tenant_id)
    .eq("period_year", parsedYear.data)
    .eq("status", "paid");

  const periodIds = (periods ?? []).map((p) => p.id);

  if (periodIds.length === 0) {
    return { success: true, data: [] };
  }

  // Get all entries for these periods
  const { data: entries, error } = await supabase
    .from("payroll_entries")
    .select(
      `
      employee_id, gross_total, total_insurance_employee,
      dependent_deduction, taxable_income, pit_tax, net_salary,
      employees (
        employee_code, id_number,
        profiles ( full_name )
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .in("payroll_period_id", periodIds);

  if (error) {
    return { success: false, error: "Không thể tải dữ liệu bảng lương." };
  }

  // Aggregate per employee
  const summaryMap = new Map<
    number,
    {
      employee_id: number;
      employee_code: string;
      full_name: string;
      id_number: string;
      total_gross: number;
      total_insurance: number;
      total_dependent_deduction: number;
      total_taxable_income: number;
      total_pit: number;
      total_net: number;
      months: number;
    }
  >();

  for (const entry of entries ?? []) {
    const empId = entry.employee_id;
    const emp = entry.employees as {
      employee_code: string;
      id_number: string | null;
      profiles: { full_name: string } | null;
    } | null;

    const cur = summaryMap.get(empId) ?? {
      employee_id: empId,
      employee_code: emp?.employee_code ?? "",
      full_name: emp?.profiles?.full_name ?? "",
      id_number: emp?.id_number ?? "",
      total_gross: 0,
      total_insurance: 0,
      total_dependent_deduction: 0,
      total_taxable_income: 0,
      total_pit: 0,
      total_net: 0,
      months: 0,
    };

    cur.total_gross += Number(entry.gross_total);
    cur.total_insurance += Number(entry.total_insurance_employee);
    cur.total_dependent_deduction += Number(entry.dependent_deduction);
    cur.total_taxable_income += Number(entry.taxable_income);
    cur.total_pit += Number(entry.pit_tax);
    cur.total_net += Number(entry.net_salary);
    cur.months++;

    summaryMap.set(empId, cur);
  }

  return {
    success: true,
    data: Array.from(summaryMap.values()),
    meta: { year: parsedYear.data, periodCount: periodIds.length },
  };
}

/* ─── Monthly Insurance Summary ─── */

export async function generateInsuranceSummary(
  month: number,
  year: number,
): Promise<ActionResult> {
  const parsedMonth = z.coerce.number().int().min(1).max(12).safeParse(month);
  const parsedYear = z.coerce.number().int().min(2020).safeParse(year);
  if (!parsedMonth.success || !parsedYear.success) {
    return { success: false, error: "Tháng/năm không hợp lệ" };
  }

  const ctx = await getAuthContext(REPORT_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // Find the period
  const { data: period } = await supabase
    .from("payroll_periods")
    .select("id")
    .eq("tenant_id", claims.tenant_id)
    .eq("period_month", parsedMonth.data)
    .eq("period_year", parsedYear.data)
    .maybeSingle();

  if (!period) {
    return { success: true, data: [], meta: { message: "Chưa có kỳ lương" } };
  }

  const { data: entries, error } = await supabase
    .from("payroll_entries")
    .select(
      `
      employee_id, insurance_base,
      bhxh_employee, bhyt_employee, bhtn_employee, total_insurance_employee,
      bhxh_employer, bhyt_employer, bhtn_employer, total_insurance_employer,
      employees (
        employee_code,
        profiles ( full_name )
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("payroll_period_id", period.id);

  if (error) {
    return { success: false, error: "Không thể tải dữ liệu bảo hiểm." };
  }

  return { success: true, data: entries ?? [] };
}
