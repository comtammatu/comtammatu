"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { fetchLeaveRequestRows } from "@lib/hr/leave-request-data";
import { withAction } from "@/_lib/with-action";

const REVIEW_ROLES: readonly StaffRole[] = ["owner", "branch_manager"];
const fetchSchema = z.object({
  branchId: z.number().int().positive().nullable(),
});

export const fetchLeaveRequests = withAction(
  {
    roles: REVIEW_ROLES,
    schema: fetchSchema,
    permission: PERMISSION_KEYS.HR_APPROVE_LEAVE_REQUEST,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    return fetchLeaveRequestRows({
      supabase,
      branchId: data.branchId,
      tenantId: claims.tenant_id,
    });
  },
);

const requestIdSchema = z.object({
  requestId: z.number().int().positive(),
  branchId: z.number().int().positive().nullable(),
});

function revalidateLeavePaths(branchId: number | null) {
  revalidatePath("/hr");
  revalidatePath("/hr/attendance");
  if (branchId != null) {
    revalidatePath(`/br/${branchId}/shift/leave-approvals`);
    revalidatePath(`/br/${branchId}/team`);
  }
}

export const approveLeaveRequest = withAction(
  {
    roles: REVIEW_ROLES,
    schema: requestIdSchema,
    permission: PERMISSION_KEYS.HR_APPROVE_LEAVE_REQUEST,
    permissionBranchId: (data) => data.branchId,
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

    revalidateLeavePaths(data.branchId);
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
    permissionBranchId: (data) => data.branchId,
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

    revalidateLeavePaths(data.branchId);
    return { success: true };
  },
);
