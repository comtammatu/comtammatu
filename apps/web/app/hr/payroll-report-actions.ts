"use server";

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";

const REPORT_ROLES: readonly StaffRole[] = ["owner", "super_manager"];

/* ─── Annual Payroll Summary (for PIT filing) ─── */

const generatePayrollSummarySchema = z.object({
  year: z.coerce.number().int().min(2020),
});

export const generatePayrollSummary = withAction(
  { roles: REPORT_ROLES, schema: generatePayrollSummarySchema, permission: PERMISSION_KEYS.FINANCE_PAYROLL_CALCULATE },
  async (data, { supabase, claims }) => {
    const { data: periods } = await supabase
      .from("payroll_periods")
      .select("id")
      .eq("tenant_id", claims.tenant_id)
      .eq("period_year", data.year)
      .eq("status", "paid");

    const periodIds = (periods ?? []).map((p) => p.id);

    if (periodIds.length === 0) {
      return { success: true, data: [] };
    }

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
      meta: { year: data.year, periodCount: periodIds.length },
    };
  },
);

/* ─── Monthly Insurance Summary ─── */

const generateInsuranceSummarySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020),
});

export const generateInsuranceSummary = withAction(
  { roles: REPORT_ROLES, schema: generateInsuranceSummarySchema, permission: PERMISSION_KEYS.FINANCE_PAYROLL_CALCULATE },
  async (data, { supabase, claims }) => {
    const { data: period } = await supabase
      .from("payroll_periods")
      .select("id")
      .eq("tenant_id", claims.tenant_id)
      .eq("period_month", data.month)
      .eq("period_year", data.year)
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
  },
);
