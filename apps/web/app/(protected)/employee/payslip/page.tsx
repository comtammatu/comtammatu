import { redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { getEmployeeContext } from "../_lib/employee-context";
import { PayslipClient } from "./payslip-client";
import {
  EmployeeMissingProfileEmpty,
  EmployeePage,
} from "../components/employee-page";
import { YearPicker } from "./year-picker";
import {
  appendSearchParams,
  resolveEmployeeBranchRuntimePath,
} from "../_lib/branch-runtime-redirect";
import { getTodayVN } from "../_lib/vn-business-date";
import { messages } from "@lib/messages";

const copy = messages.employee.payslip;

export async function PayslipPageContent(props: {
  searchParams: Promise<{ year?: string }>;
  hideHeaderOnMobile?: boolean;
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
        hideHeaderOnMobile={props.hideHeaderOnMobile}
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
	      id, working_days, paid_leave_days, unpaid_leave_days, payable_days,
	      standard_days, base_salary, gross_total,
	      insurance_base, total_insurance_employee, pit_tax, net_salary,
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
      hideHeaderOnMobile={props.hideHeaderOnMobile}
    >
      <YearPicker selectedYear={year} currentYear={currentYear} />
      <PayslipClient entries={(entries ?? []) as unknown as PayslipEntry[]} />
    </EmployeePage>
  );
}

export default async function PayslipPage(props: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { claims } = await loadAuthState();
  const branchRuntimePath = resolveEmployeeBranchRuntimePath(
    claims,
    "shiftPayslip",
  );
  if (branchRuntimePath) {
    const { year } = await props.searchParams;
    redirect(appendSearchParams(branchRuntimePath, { year }));
  }

  return <PayslipPageContent searchParams={props.searchParams} />;
}

function isValidYear(s: string | undefined): boolean {
  if (typeof s !== "string") return false;
  const n = Number(s);
  return Number.isInteger(n) && n >= 2020 && n <= 2100;
}

export interface PayslipEntry {
  id: number;
  working_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  payable_days: number;
  standard_days: number;
  base_salary: number;
  gross_total: number;
  insurance_base: number;
  total_insurance_employee: number;
  pit_tax: number;
  net_salary: number;
  payroll_periods: {
    period_month: number;
    period_year: number;
    status: string;
  } | null;
}
