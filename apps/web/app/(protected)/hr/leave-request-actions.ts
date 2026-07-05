"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { getVNMonthEndDateString } from "@comtammatu/shared/time";
import { withAction } from "@/_lib/with-action";
import {
  countOverlapDays,
  suggestAnnualLeaveEntitlement,
} from "./payroll-day-math";

const REVIEW_ROLES: readonly StaffRole[] = ["owner", "branch_manager"];

const fetchSchema = z.object({
  branchId: z.coerce.number().int().positive(),
});

const fetchMonthSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, { error: "Tháng không hợp lệ (YYYY-MM)" }),
});

// Approved leave ranges overlapping the viewed month (attendance tab).
export const fetchApprovedLeaveMonth = withAction(
  {
    roles: REVIEW_ROLES,
    schema: fetchMonthSchema,
    permission: PERMISSION_KEYS.HR_APPROVE_LEAVE_REQUEST,
    permissionBranchId: (data) => data.branchId,
  },
  async (data, { supabase, claims }) => {
    const [year, mon] = data.month.split("-").map(Number);
    const startDate = `${data.month}-01`;
    const endDate = getVNMonthEndDateString(year!, mon!);

    const { data: result, error } = await supabase
      .from("leave_requests")
      .select(
        `
        id, start_date, end_date, leave_type,
        employees (
          id, employee_code,
          profiles ( full_name )
        )
      `,
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", data.branchId)
      .eq("status", "approved")
      .lte("start_date", endDate)
      .gte("end_date", startDate)
      .order("start_date");

    if (error) {
      console.error(
        "[hr/leave-request-actions:fetchApprovedLeaveMonth] Fetch approved leaves error:",
        error,
      );
      return { success: false, error: "Không thể tải nghỉ phép trong tháng." };
    }

    return { success: true, data: result ?? [] };
  },
);

export const fetchLeaveRequests = withAction(
  {
    roles: REVIEW_ROLES,
    schema: fetchSchema,
    permission: PERMISSION_KEYS.HR_APPROVE_LEAVE_REQUEST,
    permissionBranchId: (data) => data.branchId,
  },
  async (data, { supabase, claims }) => {
    const { data: result, error } = await supabase
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
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", data.branchId)
      .order("start_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error(
        "[hr/leave-request-actions:fetchLeaveRequests] Fetch leave requests error:",
        error,
      );
      return { success: false, error: "Không thể tải danh sách nghỉ phép." };
    }

    const rows = result ?? [];
    const annualRows = rows.filter(
      (request) => request.leave_type === "annual",
    );
    if (annualRows.length === 0) {
      return { success: true, data: rows };
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
      return {
        success: true,
        data: rows.map((request) => ({
          ...request,
          annual_leave_balance: null,
        })),
      };
    }

    const [minYear, maxYear] = [Math.min(...years), Math.max(...years)];
    const [
      { data: entitlements, error: entitlementError },
      { data: approvedAnnualLeaves, error: approvedAnnualError },
    ] = await Promise.all([
      supabase
        .from("annual_leave_entitlements")
        .select("employee_id, year, entitlement_days")
        .eq("tenant_id", claims.tenant_id)
        .in("employee_id", employeeIds)
        .in("year", years),
      supabase
        .from("leave_requests")
        .select("employee_id, start_date, end_date")
        .eq("tenant_id", claims.tenant_id)
        .eq("leave_type", "annual")
        .eq("status", "approved")
        .in("employee_id", employeeIds)
        .lte("start_date", `${maxYear}-12-31`)
        .gte("end_date", `${minYear}-01-01`),
    ]);

    if (entitlementError || approvedAnnualError) {
      console.error(
        "[hr/leave-request-actions:fetchLeaveRequests] Fetch entitlements/approved leaves details error:",
        {
          entitlementError,
          approvedAnnualError,
        },
      );
      return { success: false, error: "Không thể tải hạn mức phép năm." };
    }

    const entitlementByEmployeeYear = new Map<string, number>();
    for (const entitlement of entitlements ?? []) {
      entitlementByEmployeeYear.set(
        `${entitlement.employee_id}:${entitlement.year}`,
        Number(entitlement.entitlement_days ?? 0),
      );
    }

    const usedByEmployeeYear = new Map<string, number>();
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
        usedByEmployeeYear.set(key, (usedByEmployeeYear.get(key) ?? 0) + used);
      }
    }

    const enriched = rows.map((request) => {
      if (request.leave_type !== "annual" || !request.employees?.id) {
        return { ...request, annual_leave_balance: null };
      }

      const year = Number(request.start_date.slice(0, 4));
      const key = `${request.employees.id}:${year}`;
      const entitlementDays =
        entitlementByEmployeeYear.get(key) ??
        suggestAnnualLeaveEntitlement(request.employees.start_date, year);
      const usedDays = usedByEmployeeYear.get(key) ?? 0;

      return {
        ...request,
        annual_leave_balance: {
          year,
          entitlementDays,
          usedDays,
          remainingDays: Math.max(0, entitlementDays - usedDays),
        },
      };
    });

    return { success: true, data: enriched };
  },
);

const requestIdSchema = z.object({
  requestId: z.coerce.number().int().positive(),
});

function revalidateLeavePaths() {
  revalidatePath("/hr");
  revalidatePath("/br");
}

export const approveLeaveRequest = withAction(
  {
    roles: REVIEW_ROLES,
    schema: requestIdSchema,
    permission: PERMISSION_KEYS.HR_APPROVE_LEAVE_REQUEST,
    requireBranchScope: true,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc("approve_leave_request", {
      p_request_id: data.requestId,
    });

    if (error) {
      console.error(
        "[hr/leave-request-actions:approveLeaveRequest] RPC approve_leave_request error:",
        error,
      );
      if (error.message.includes("cannot review own request")) {
        return {
          success: false,
          error: "Không thể tự duyệt yêu cầu của mình.",
        };
      }
      if (error.message.includes("not pending")) {
        return {
          success: false,
          error: "Yêu cầu không còn ở trạng thái chờ duyệt.",
        };
      }
      if (error.message.includes("annual leave quota exceeded")) {
        return {
          success: false,
          error: "Không đủ phép năm còn lại để duyệt nghỉ có lương.",
        };
      }
      if (error.message.includes("missing permission")) {
        return {
          success: false,
          error: "Không có quyền duyệt nghỉ cho chi nhánh này.",
        };
      }
      if (error.message.includes("not found")) {
        return { success: false, error: "Không tìm thấy yêu cầu." };
      }
      return { success: false, error: "Không thể duyệt yêu cầu nghỉ." };
    }

    revalidateLeavePaths();
    return { success: true };
  },
);

const rejectSchema = requestIdSchema.extend({
  reason: z.string().max(500).optional(),
});

export const rejectLeaveRequest = withAction(
  {
    roles: REVIEW_ROLES,
    schema: rejectSchema,
    permission: PERMISSION_KEYS.HR_APPROVE_LEAVE_REQUEST,
    requireBranchScope: true,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc("reject_leave_request", {
      p_request_id: data.requestId,
      p_reason: data.reason,
    });

    if (error) {
      console.error(
        "[hr/leave-request-actions:rejectLeaveRequest] RPC reject_leave_request error:",
        error,
      );
      if (error.message.includes("cannot review own request")) {
        return {
          success: false,
          error: "Không thể tự xử lý yêu cầu của mình.",
        };
      }
      if (error.message.includes("not pending")) {
        return {
          success: false,
          error: "Yêu cầu không còn ở trạng thái chờ duyệt.",
        };
      }
      if (error.message.includes("reason too long")) {
        return { success: false, error: "Lý do từ chối quá dài." };
      }
      if (error.message.includes("missing permission")) {
        return {
          success: false,
          error: "Không có quyền duyệt nghỉ cho chi nhánh này.",
        };
      }
      if (error.message.includes("not found")) {
        return { success: false, error: "Không tìm thấy yêu cầu." };
      }
      return { success: false, error: "Không thể từ chối yêu cầu nghỉ." };
    }

    revalidateLeavePaths();
    return { success: true };
  },
);
