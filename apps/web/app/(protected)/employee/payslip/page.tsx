import { getEmployeeContext } from "../_lib/employee-context";
import { PayslipClient } from "./payslip-client";
import {
  EmployeeMissingProfileEmpty,
  EmployeePage,
} from "../components/employee-page";
import { YearPicker } from "./year-picker";
import { getTodayVN } from "../_lib/vn-business-date";
import { messages } from "@lib/messages";

const copy = messages.employee.payslip;

export default async function PayslipPage(props: {
  searchParams: Promise<{ year?: string }>;
}) {
  const ctx = await getEmployeeContext();
  const { year: yearParam } = await props.searchParams;
  const currentYear = Number(getTodayVN().slice(0, 4));
  const year = isValidYear(yearParam) ? Number(yearParam) : currentYear;

  if (!ctx) {
    return (
      <EmployeePage
        title={copy.title}
        description={copy.description}
      >
        <EmployeeMissingProfileEmpty
          title={copy.missingProfileTitle}
          description={copy.missingProfileDescription}
        />
      </EmployeePage>
    );
  }

  const { supabase, claims, employeeId } = ctx;

  // Only fetch payroll entries from PAID periods — draft/calculated/approved
  // periods are never visible to employees until the business releases them.
  const { data: entries } = await supabase
    .from("payroll_entries")
    .select(
      `
      id, working_days, standard_days, base_salary, gross_total,
      total_insurance_employee, net_salary,
      payroll_periods!inner ( period_month, period_year, status )
    `,
    )
    .eq("employee_id", employeeId)
    .eq("tenant_id", claims.tenant_id)
    .eq("payroll_periods.status", "paid")
    .eq("payroll_periods.period_year", year)
    .order("created_at", { ascending: false })
    .limit(12);

  return (
    <EmployeePage
      title={copy.title}
      description={copy.description}
      badge={{ children: `${copy.yearBadge} ${year}`, variant: "outline" }}
    >
      <YearPicker selectedYear={year} currentYear={currentYear} />
      <PayslipClient entries={(entries ?? []) as unknown as PayslipEntry[]} />
    </EmployeePage>
  );
}

function isValidYear(s: string | undefined): boolean {
  if (typeof s !== "string") return false;
  const n = Number(s);
  return Number.isInteger(n) && n >= 2020 && n <= 2100;
}

export interface PayslipEntry {
  id: number;
  working_days: number;
  standard_days: number;
  base_salary: number;
  gross_total: number;
  total_insurance_employee: number;
  net_salary: number;
  payroll_periods: {
    period_month: number;
    period_year: number;
    status: string;
  } | null;
}
