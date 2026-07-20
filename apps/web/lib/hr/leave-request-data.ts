import "server-only";

import { z } from "zod";
import { messages } from "@lib/messages";
import type { TenantSupabase } from "@lib/inventory/types";
import {
  calculateAnnualLeaveUsedThroughMonth,
  calculateMonthlyLeaveUsedInMonth,
} from "./payroll-day-math";
import { fetchTenantHrLeavePolicy } from "./leave-policy-data";
import type { LeaveRequestRow } from "./leave-request-model";

const approvedAnnualRangeSchema = z.object({
  start_date: z.string(),
  end_date: z.string(),
});

const leaveReviewQueueRowSchema = z.object({
  id: z.number(),
  status: z.enum(["pending", "approved", "rejected", "cancelled"]),
  start_date: z.string(),
  end_date: z.string(),
  leave_type: z.enum(["annual", "sick", "unpaid", "personal", "other"]),
  reason: z.string().nullable(),
  rejected_reason: z.string().nullable(),
  created_at: z.string(),
  reviewed_at: z.string().nullable(),
  branch_id: z.number(),
  employee_id: z.number(),
  employee_code: z.string().nullable(),
  employee_start_date: z.string().nullable(),
  employee_full_name: z.string(),
  position_code: z.string().nullable(),
  approved_annual_ranges: z.array(approvedAnnualRangeSchema),
});

export type LeaveRequestRowsResult =
  | { success: true; data: LeaveRequestRow[] }
  | { success: false; error: string };

export async function fetchLeaveRequestRows(input: {
  supabase: TenantSupabase;
  branchId: number;
  tenantId: number;
}): Promise<LeaveRequestRowsResult> {
  const [{ data: result, error }, policyResult] = await Promise.all([
    input.supabase.rpc("get_leave_review_queue", {
      p_branch_id: input.branchId,
      p_include_rows: true,
    }),
    fetchTenantHrLeavePolicy({
      supabase: input.supabase,
      tenantId: input.tenantId,
    }),
  ]);

  if (error) {
    console.error("hr.leave_requests.fetch_failed", { code: error?.code });
    return { success: false, error: messages.hr.leave.loadFailed };
  }
  if (!policyResult.success) {
    console.error("hr.leave_requests.policy_fetch_failed");
    return { success: false, error: messages.hr.leave.quotaLoadFailed };
  }

  const parsedRows = z
    .array(leaveReviewQueueRowSchema)
    .safeParse(result?.[0]?.rows ?? []);
  if (!parsedRows.success) {
    console.error("hr.leave_requests.invalid_projection", {
      issueCount: parsedRows.error.issues.length,
    });
    return { success: false, error: messages.hr.leave.loadFailed };
  }

  const employeeIds = [
    ...new Set(parsedRows.data.map((request) => request.employee_id)),
  ];
  const years = [
    ...new Set(
      parsedRows.data.map((request) => Number(request.start_date.slice(0, 4))),
    ),
  ];
  const { data: entitlements, error: entitlementsError } =
    employeeIds.length === 0 || years.length === 0
      ? { data: [], error: null }
      : await input.supabase
          .from("annual_leave_entitlements")
          .select("employee_id, year, entitlement_days")
          .eq("tenant_id", input.tenantId)
          .in("employee_id", employeeIds)
          .in("year", years);

  if (entitlementsError) {
    console.error("hr.leave_requests.entitlements_fetch_failed", {
      code: entitlementsError.code,
    });
    return { success: false, error: messages.hr.leave.quotaLoadFailed };
  }

  const entitlementByEmployeeYear = new Map<string, number>();
  for (const entitlement of entitlements ?? []) {
    entitlementByEmployeeYear.set(
      `${entitlement.employee_id}:${entitlement.year}`,
      Number(entitlement.entitlement_days),
    );
  }
  const policy = policyResult.data;

  return {
    success: true,
    data: parsedRows.data.map((request): LeaveRequestRow => {
      const year = Number(request.start_date.slice(0, 4));
      const month = Number(request.start_date.slice(5, 7));
      const entitlementDays = entitlementByEmployeeYear.get(
        `${request.employee_id}:${year}`,
      );
      const annualLeaves = request.approved_annual_ranges.map((leave) => ({
        employeeId: request.employee_id,
        startDate: leave.start_date,
        endDate: leave.end_date,
        leaveType: "annual" as const,
      }));
      const usedDays =
        entitlementDays == null
          ? 0
          : calculateAnnualLeaveUsedThroughMonth({
              leaves: annualLeaves,
              entitlementDays,
              monthlyLeaveDays: policy.monthlyLeaveDays,
              year,
              throughMonth: month,
            });
      const monthlyLeaveUsedDays = calculateMonthlyLeaveUsedInMonth({
        leaves: annualLeaves,
        year,
        month,
        monthlyLeaveDays: policy.monthlyLeaveDays,
      });

      return {
        id: request.id,
        status: request.status,
        start_date: request.start_date,
        end_date: request.end_date,
        leave_type: request.leave_type,
        reason: request.reason,
        rejected_reason: request.rejected_reason,
        created_at: request.created_at,
        reviewed_at: request.reviewed_at,
        branch_id: request.branch_id,
        employees: {
          id: request.employee_id,
          employee_code: request.employee_code,
          start_date: request.employee_start_date,
          profiles: {
            full_name: request.employee_full_name,
            positions:
              request.position_code == null
                ? null
                : { code: request.position_code },
          },
        },
        annual_leave_balance:
          request.leave_type === "annual" && entitlementDays != null
            ? {
                year,
                entitlementDays,
                usedDays,
                remainingDays: Math.max(0, entitlementDays - usedDays),
              }
            : null,
        monthly_leave_balance:
          request.leave_type === "annual"
            ? {
                entitlementDays: policy.monthlyLeaveDays,
                usedDays: monthlyLeaveUsedDays,
                remainingDays: Math.max(
                  0,
                  policy.monthlyLeaveDays - monthlyLeaveUsedDays,
                ),
              }
            : null,
      };
    }),
  };
}
