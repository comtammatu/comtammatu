"use server";

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";

const APPROVE_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "branch_manager",
];

/* ─── Fetch pending requests for a branch ─── */

const fetchPendingSchema = z.object({
  branchId: z.coerce.number().int().positive(),
});

export const fetchPendingShiftRequests = withAction(
  {
    roles: APPROVE_ROLES,
    schema: fetchPendingSchema,
    permission: PERMISSION_KEYS.HR_APPROVE_SHIFT_REQUEST,
    permissionBranchId: (data) => data.branchId,
  },
  async (data, { supabase, claims }) => {
    const { data: result, error } = await supabase
      .from("shift_requests")
      .select(
        `
      id, status, date, note, created_at, rejected_reason,
      employee_id, shift_id, branch_id,
      shifts ( id, name, start_time, end_time ),
      employees (
        id, employee_code,
        profiles ( full_name )
      )
    `,
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", data.branchId)
      .order("date", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      return { success: false, error: "Không thể tải danh sách đăng ký ca." };
    }

    return { success: true, data: result ?? [] };
  },
);

/* ─── Approve (calls atomic RPC) ─── */

const requestIdSchema = z.object({
  requestId: z.coerce.number().int().positive(),
});

export const approveShiftRequest = withAction(
  {
    roles: APPROVE_ROLES,
    schema: requestIdSchema,
    permission: PERMISSION_KEYS.HR_APPROVE_SHIFT_REQUEST,
    requireBranchScope: true,
  },
  async (data, { supabase }) => {
    const { data: assignmentId, error } = await supabase.rpc(
      "approve_shift_request",
      { p_request_id: data.requestId },
    );

    if (error) {
      if (error.message.includes("cannot approve own request")) {
        return {
          success: false,
          error: "Không thể tự duyệt đăng ký của mình.",
        };
      }
      if (error.message.includes("not pending")) {
        return {
          success: false,
          error: "Đăng ký không còn ở trạng thái chờ duyệt.",
        };
      }
      if (error.message.includes("missing permission")) {
        return {
          success: false,
          error: "Không có quyền duyệt cho chi nhánh này.",
        };
      }
      if (error.message.includes("not found")) {
        return { success: false, error: "Không tìm thấy đăng ký." };
      }
      return { success: false, error: "Không thể duyệt đăng ký." };
    }

    return { success: true, data: { assignmentId } };
  },
);

/* ─── Reject (calls RPC) ─── */

const rejectSchema = z.object({
  requestId: z.coerce.number().int().positive(),
  reason: z.string().max(500).optional(),
});

export const rejectShiftRequest = withAction(
  {
    roles: APPROVE_ROLES,
    schema: rejectSchema,
    permission: PERMISSION_KEYS.HR_APPROVE_SHIFT_REQUEST,
    requireBranchScope: true,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc("reject_shift_request", {
      p_request_id: data.requestId,
      p_reason: data.reason,
    });

    if (error) {
      if (error.message.includes("not pending")) {
        return {
          success: false,
          error: "Đăng ký không còn ở trạng thái chờ duyệt.",
        };
      }
      if (error.message.includes("missing permission")) {
        return {
          success: false,
          error: "Không có quyền duyệt cho chi nhánh này.",
        };
      }
      if (error.message.includes("not found")) {
        return { success: false, error: "Không tìm thấy đăng ký." };
      }
      return { success: false, error: "Không thể từ chối đăng ký." };
    }

    return { success: true };
  },
);
