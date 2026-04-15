import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  buildLoginBlockedStatePath,
  extractClaims,
} from "@comtammatu/shared/auth";
import { PayslipClient } from "./payslip-client";

export default async function PayslipPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/login");

  const claims = extractClaims(session.user.app_metadata);
  if (!claims) redirect(buildLoginBlockedStatePath());

  // Find this user's employee record
  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", session.user.id)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!employee) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Không tìm thấy hồ sơ nhân viên. Liên hệ quản lý.
      </div>
    );
  }

  // Get recent payroll entries for this employee
  const { data: entries } = await supabase
    .from("payroll_entries")
    .select(
      `
      id, working_days, standard_days, base_salary, gross_total,
      total_insurance_employee, personal_deduction, dependent_count,
      dependent_deduction, taxable_income, pit_tax, net_salary,
      payroll_periods ( period_month, period_year, status )
    `,
    )
    .eq("employee_id", employee.id)
    .eq("tenant_id", claims.tenant_id)
    .order("created_at", { ascending: false })
    .limit(12);

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Phiếu lương</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          12 kỳ lương gần nhất
        </p>
      </div>

      <PayslipClient entries={(entries ?? []) as PayslipEntry[]} />
    </div>
  );
}

export interface PayslipEntry {
  id: number;
  working_days: number;
  standard_days: number;
  base_salary: number;
  gross_total: number;
  total_insurance_employee: number;
  personal_deduction: number;
  dependent_count: number;
  dependent_deduction: number;
  taxable_income: number;
  pit_tax: number;
  net_salary: number;
  payroll_periods: {
    period_month: number;
    period_year: number;
    status: string;
  } | null;
}
