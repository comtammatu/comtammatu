import { redirect } from "next/navigation";
import { fetchPayrollPeriod } from "../../payroll-actions";

export default async function PayrollDetailPage({
  params,
}: {
  params: Promise<{ periodId: string }>;
}) {
  const { periodId } = await params;
  const id = Number(periodId);
  if (!Number.isInteger(id) || id <= 0) {
    redirect("/hr/payroll");
  }

  const result = await fetchPayrollPeriod({ periodId: id });
  if (!result.success || !result.data) {
    redirect("/hr/payroll");
  }

  const period = result.data;
  redirect(
    `/hr/payroll?month=${period.period_year}-${String(period.period_month).padStart(2, "0")}&standardDays=${period.standard_days}`,
  );
}
