import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getHrScopeBranchId,
  type HrBranchScope,
} from "@/lib/hr-scope";

export type HrAttentionSummary = {
  pendingApprovals: number;
  missingContractOrSalary: number;
};

/**
 * Owner HR landing action counts. Approvals = pending leave + checkout
 * requests awaiting review. Missing salary = active employees without a
 * usable contract/employee salary for payroll.
 */
export async function fetchHrAttentionSummary(
  supabase: SupabaseClient,
  tenantId: number,
  branchScope: HrBranchScope,
): Promise<HrAttentionSummary> {
  let leaveQuery = supabase
    .from("leave_requests")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "pending");
  let checkoutQuery = supabase
    .from("attendance_records")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .not("checkout_requested_at", "is", null)
    .is("checkout_approved_at", null)
    .is("check_out", null);
  let employeesQuery = supabase
    .from("employees")
    .select(
      `
        id,
        base_salary,
        is_active,
        profiles!inner ( branch_id ),
        employment_contracts (
          id,
          status,
          gross_salary
        )
      `,
    )
    .eq("tenant_id", tenantId)
    .eq("is_active", true);
  const branchId = getHrScopeBranchId(branchScope);
  if (branchId != null) {
    leaveQuery = leaveQuery.eq("branch_id", branchId);
    checkoutQuery = checkoutQuery.eq("branch_id", branchId);
    employeesQuery = employeesQuery.eq("profiles.branch_id", branchId);
  } else if (branchScope === "office") {
    leaveQuery = leaveQuery.is("branch_id", null);
    checkoutQuery = checkoutQuery.is("branch_id", null);
    employeesQuery = employeesQuery.is("profiles.branch_id", null);
  }
  const [leaveResult, checkoutResult, employeesResult] = await Promise.all([
    leaveQuery,
    checkoutQuery,
    employeesQuery,
  ]);

  const pendingLeave = leaveResult.count ?? 0;
  const pendingCheckout = checkoutResult.count ?? 0;

  let missingContractOrSalary = 0;
  for (const employee of employeesResult.data ?? []) {
    const activeContract = (
      employee.employment_contracts as
        | Array<{ status: string; gross_salary: number | null }>
        | null
        | undefined
    )?.find((contract) => contract.status === "active");
    const salary =
      activeContract?.gross_salary ??
      (typeof employee.base_salary === "number" ? employee.base_salary : null);
    if (salary == null || salary <= 0) {
      missingContractOrSalary += 1;
    }
  }

  return {
    pendingApprovals: pendingLeave + pendingCheckout,
    missingContractOrSalary,
  };
}
