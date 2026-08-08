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
  branch_id: z.number().nullable(),
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

function mapLeaveRowsWithBalances(input: {
  rows: z.infer<typeof leaveReviewQueueRowSchema>[];
  entitlementByEmployeeYear: Map<string, number>;
  monthlyLeaveDays: number;
}): LeaveRequestRow[] {
  return input.rows.map((request): LeaveRequestRow => {
    const year = Number(request.start_date.slice(0, 4));
    const month = Number(request.start_date.slice(5, 7));
    const entitlementDays = input.entitlementByEmployeeYear.get(
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
            monthlyLeaveDays: input.monthlyLeaveDays,
            year,
            throughMonth: month,
          });
    const monthlyLeaveUsedDays = calculateMonthlyLeaveUsedInMonth({
      leaves: annualLeaves,
      year,
      month,
      monthlyLeaveDays: input.monthlyLeaveDays,
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
              entitlementDays: input.monthlyLeaveDays,
              usedDays: monthlyLeaveUsedDays,
              remainingDays: Math.max(
                0,
                input.monthlyLeaveDays - monthlyLeaveUsedDays,
              ),
            }
          : null,
    };
  });
}

async function loadEntitlementMap(input: {
  supabase: TenantSupabase;
  tenantId: number;
  employeeIds: number[];
  years: number[];
}): Promise<
  | { success: true; map: Map<string, number> }
  | { success: false; error: string }
> {
  const { data: entitlements, error: entitlementsError } =
    input.employeeIds.length === 0 || input.years.length === 0
      ? { data: [], error: null }
      : await input.supabase
          .from("annual_leave_entitlements")
          .select("employee_id, year, entitlement_days")
          .eq("tenant_id", input.tenantId)
          .in("employee_id", input.employeeIds)
          .in("year", input.years);

  if (entitlementsError) {
    console.error("hr.leave_requests.entitlements_fetch_failed", {
      code: entitlementsError.code,
    });
    return { success: false, error: messages.hr.leave.quotaLoadFailed };
  }

  const map = new Map<string, number>();
  for (const entitlement of entitlements ?? []) {
    map.set(
      `${entitlement.employee_id}:${entitlement.year}`,
      Number(entitlement.entitlement_days),
    );
  }
  return { success: true, map };
}

async function fetchOfficeLeaveRequestRows(input: {
  supabase: TenantSupabase;
  tenantId: number;
}): Promise<LeaveRequestRowsResult> {
  const [{ data: rows, error }, policyResult] = await Promise.all([
    input.supabase
      .from("leave_requests")
      .select(
        `
        id, status, start_date, end_date, leave_type, reason, rejected_reason,
        created_at, reviewed_at, branch_id, employee_id,
        employees (
          id, employee_code, start_date,
          profiles ( full_name, positions ( code ) )
        )
      `,
      )
      .eq("tenant_id", input.tenantId)
      .is("branch_id", null)
      .order("created_at", { ascending: false }),
    fetchTenantHrLeavePolicy({
      supabase: input.supabase,
      tenantId: input.tenantId,
    }),
  ]);

  if (error) {
    console.error("hr.leave_requests.office_fetch_failed", {
      code: error.code,
    });
    return { success: false, error: messages.hr.leave.loadFailed };
  }
  if (!policyResult.success) {
    console.error("hr.leave_requests.policy_fetch_failed");
    return { success: false, error: messages.hr.leave.quotaLoadFailed };
  }

  type OfficeLeaveRow = {
    id: number;
    status: LeaveRequestRow["status"];
    start_date: string;
    end_date: string;
    leave_type: LeaveRequestRow["leave_type"];
    reason: string | null;
    rejected_reason: string | null;
    created_at: string;
    reviewed_at: string | null;
    branch_id: number | null;
    employee_id: number;
    employees:
      | {
          id: number;
          employee_code: string | null;
          start_date: string | null;
          profiles:
            | {
                full_name: string | null;
                positions: { code: string } | { code: string }[] | null;
              }
            | {
                full_name: string | null;
                positions: { code: string } | { code: string }[] | null;
              }[]
            | null;
        }
      | {
          id: number;
          employee_code: string | null;
          start_date: string | null;
          profiles:
            | {
                full_name: string | null;
                positions: { code: string } | { code: string }[] | null;
              }
            | {
                full_name: string | null;
                positions: { code: string } | { code: string }[] | null;
              }[]
            | null;
        }[]
      | null;
  };

  const officeRows = ((rows ?? []) as OfficeLeaveRow[]).map((row) => {
    const employee = Array.isArray(row.employees)
      ? row.employees[0]
      : row.employees;
    const profile = Array.isArray(employee?.profiles)
      ? employee?.profiles[0]
      : employee?.profiles;
    const position = Array.isArray(profile?.positions)
      ? profile?.positions[0]
      : profile?.positions;

    return {
      id: row.id,
      status: row.status,
      start_date: row.start_date,
      end_date: row.end_date,
      leave_type: row.leave_type,
      reason: row.reason,
      rejected_reason: row.rejected_reason,
      created_at: row.created_at,
      reviewed_at: row.reviewed_at,
      branch_id: null,
      employee_id: row.employee_id,
      employee_code: employee?.employee_code ?? null,
      employee_start_date: employee?.start_date ?? null,
      employee_full_name:
        profile?.full_name ?? messages.hr.leave.fallbackEmployee,
      position_code: position?.code ?? null,
      approved_annual_ranges: [] as Array<{
        start_date: string;
        end_date: string;
      }>,
    };
  });

  const parsedRows = z.array(leaveReviewQueueRowSchema).safeParse(officeRows);
  if (!parsedRows.success) {
    console.error("hr.leave_requests.office_invalid_projection", {
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
  const entitlementResult = await loadEntitlementMap({
    supabase: input.supabase,
    tenantId: input.tenantId,
    employeeIds,
    years,
  });
  if (!entitlementResult.success) return entitlementResult;

  return {
    success: true,
    data: mapLeaveRowsWithBalances({
      rows: parsedRows.data,
      entitlementByEmployeeYear: entitlementResult.map,
      monthlyLeaveDays: policyResult.data.monthlyLeaveDays,
    }),
  };
}

export async function fetchLeaveRequestRows(input: {
  supabase: TenantSupabase;
  branchId: number | null;
  tenantId: number;
}): Promise<LeaveRequestRowsResult> {
  if (input.branchId == null) {
    return fetchOfficeLeaveRequestRows(input);
  }

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
  const entitlementResult = await loadEntitlementMap({
    supabase: input.supabase,
    tenantId: input.tenantId,
    employeeIds,
    years,
  });
  if (!entitlementResult.success) return entitlementResult;

  return {
    success: true,
    data: mapLeaveRowsWithBalances({
      rows: parsedRows.data,
      entitlementByEmployeeYear: entitlementResult.map,
      monthlyLeaveDays: policyResult.data.monthlyLeaveDays,
    }),
  };
}
