"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";

const REVIEW_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "branch_manager",
];

const fetchSchema = z.object({
  branchId: z.coerce.number().int().positive(),
});

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
          id, employee_code,
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
      return { success: false, error: "Không thể tải danh sách nghỉ phép." };
    }

    return { success: true, data: result ?? [] };
  },
);

const requestIdSchema = z.object({
  requestId: z.coerce.number().int().positive(),
});

function revalidateLeavePaths() {
  revalidatePath("/hr");
  revalidatePath("/employee");
  revalidatePath("/employee/leave");
  revalidatePath("/employee/profile");
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
