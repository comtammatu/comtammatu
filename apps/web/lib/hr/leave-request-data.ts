import "server-only";

import { createServiceClient } from "@comtammatu/database/supabase/service";
import type { JwtClaims } from "@comtammatu/shared/auth";
import { messages } from "@lib/messages";
import type { TenantSupabase } from "@/(protected)/inventory/_lib/types";
import {
  calculateAnnualLeaveUsedThroughMonth,
  countAnnualLeaveAccruedThroughMonth,
  countOverlapDays,
  type LeaveRange,
} from "./payroll-day-math";
import type { LeaveRequestRow } from "./leave-request-model";

type LeaveRequestQueryRow = Omit<LeaveRequestRow, "annual_leave_balance">;

export type LeaveRequestRowsResult =
  | { success: true; data: LeaveRequestRow[] }
  | { success: false; error: string };

export async function fetchLeaveRequestRows(input: {
  supabase: TenantSupabase;
  claims: JwtClaims;
  branchId: number;
}): Promise<LeaveRequestRowsResult> {
  const leaveClient =
    input.claims.user_role === "branch_manager"
      ? createServiceClient()
      : input.supabase;
  const { data: result, error } = await leaveClient
    .from("leave_requests")
    .select(
      `
        id, status, start_date, end_date, leave_type, reason,
        rejected_reason, created_at, reviewed_at, branch_id,
        employees (
          id, employee_code, start_date,
          profiles ( full_name )
        )
      `,
    )
    .eq("tenant_id", input.claims.tenant_id)
    .eq("branch_id", input.branchId)
    .order("start_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("hr.leave_requests.fetch_failed", { code: error.code });
    return { success: false, error: messages.hr.leave.loadFailed };
  }

  const rows = (result ?? []) as unknown as LeaveRequestQueryRow[];
  const normalizedRows: LeaveRequestRow[] = rows.map((request) => ({
    ...request,
    annual_leave_balance: null,
  }));
  const annualRows = normalizedRows.filter(
    (request) => request.leave_type === "annual",
  );
  if (annualRows.length === 0) {
    return { success: true, data: normalizedRows };
  }

  const employeeIds = [
    ...new Set(
      annualRows
        .map((request) => request.employees?.id)
        .filter((employeeId): employeeId is number => employeeId != null),
    ),
  ];
  const years = [
    ...new Set(
      annualRows
        .map((request) => Number(request.start_date.slice(0, 4)))
        .filter(Number.isFinite),
    ),
  ];

  if (employeeIds.length === 0 || years.length === 0) {
    return { success: true, data: normalizedRows };
  }

  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const { data: approvedAnnualLeaves, error: approvedAnnualError } =
    await leaveClient
      .from("leave_requests")
      .select("employee_id, start_date, end_date")
      .eq("tenant_id", input.claims.tenant_id)
      .eq("leave_type", "annual")
      .eq("status", "approved")
      .in("employee_id", employeeIds)
      .lte("start_date", `${maxYear}-12-31`)
      .gte("end_date", `${minYear}-01-01`);

  if (approvedAnnualError) {
    console.error("hr.leave_requests.quota_fetch_failed", {
      code: approvedAnnualError.code,
    });
    return { success: false, error: messages.hr.leave.quotaLoadFailed };
  }

  const annualLeavesByEmployeeYear = new Map<string, LeaveRange[]>();
  for (const leave of approvedAnnualLeaves ?? []) {
    for (const year of years) {
      const used = countOverlapDays(
        leave.start_date,
        leave.end_date,
        `${year}-01-01`,
        `${year}-12-31`,
      );
      if (used === 0) continue;
      const key = `${leave.employee_id}:${year}`;
      const current = annualLeavesByEmployeeYear.get(key) ?? [];
      current.push({
        employeeId: leave.employee_id,
        startDate: leave.start_date,
        endDate: leave.end_date,
        leaveType: "annual",
      });
      annualLeavesByEmployeeYear.set(key, current);
    }
  }

  return {
    success: true,
    data: normalizedRows.map((request) => {
      if (request.leave_type !== "annual" || !request.employees?.id) {
        return request;
      }

      const year = Number(request.start_date.slice(0, 4));
      const month = Number(request.start_date.slice(5, 7));
      const key = `${request.employees.id}:${year}`;
      const entitlementDays = countAnnualLeaveAccruedThroughMonth(
        request.employees.start_date,
        year,
        month,
      );
      const usedDays = calculateAnnualLeaveUsedThroughMonth({
        leaves: annualLeavesByEmployeeYear.get(key) ?? [],
        employeeStartDate: request.employees.start_date,
        year,
        throughMonth: month,
      });

      return {
        ...request,
        annual_leave_balance: {
          year,
          entitlementDays,
          usedDays,
          remainingDays: Math.max(0, entitlementDays - usedDays),
        },
      };
    }),
  };
}
