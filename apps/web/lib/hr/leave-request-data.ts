import "server-only";

import { z } from "zod";
import { messages } from "@lib/messages";
import type { TenantSupabase } from "@/(protected)/inventory/_lib/types";
import {
  calculateAnnualLeaveUsedThroughMonth,
  countAnnualLeaveAccruedThroughMonth,
} from "./payroll-day-math";
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
}): Promise<LeaveRequestRowsResult> {
  const { data: result, error } = await input.supabase.rpc(
    "get_leave_review_queue",
    {
      p_branch_id: input.branchId,
      p_include_rows: true,
    },
  );

  if (error) {
    console.error("hr.leave_requests.fetch_failed", { code: error.code });
    return { success: false, error: messages.hr.leave.loadFailed };
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

  return {
    success: true,
    data: parsedRows.data.map((request): LeaveRequestRow => {
      const year = Number(request.start_date.slice(0, 4));
      const month = Number(request.start_date.slice(5, 7));
      const entitlementDays = countAnnualLeaveAccruedThroughMonth(
        request.employee_start_date,
        year,
        month,
      );
      const usedDays = calculateAnnualLeaveUsedThroughMonth({
        leaves: request.approved_annual_ranges.map((leave) => ({
          employeeId: request.employee_id,
          startDate: leave.start_date,
          endDate: leave.end_date,
          leaveType: "annual" as const,
        })),
        employeeStartDate: request.employee_start_date,
        year,
        throughMonth: month,
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
          request.leave_type === "annual"
            ? {
                year,
                entitlementDays,
                usedDays,
                remainingDays: Math.max(0, entitlementDays - usedDays),
              }
            : null,
      };
    }),
  };
}
