"use server";

import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import { getEmployeeContext } from "../_lib/staff-runtime-context";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  error: "Ngày không hợp lệ",
});

const leaveTypeSchema = z.enum([
  "annual",
  "sick",
  "unpaid",
  "personal",
  "other",
]);

const submitSchema = z
  .object({
    branchId: z.coerce.number().int().positive().nullable(),
    startDate: dateSchema,
    endDate: dateSchema,
    leaveType: leaveTypeSchema.default("annual"),
    reason: z.string().max(500).optional(),
  })
  .refine((data) => data.startDate <= data.endDate, {
    path: ["endDate"],
    error: "Ngày kết thúc phải sau ngày bắt đầu",
  });

export async function submitLeaveRequest(
  input: unknown,
): Promise<ActionResult<{ requestId: number }>> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const ctx = await getEmployeeContext();
  if (!ctx || ctx.claims.user_role === "owner") {
    return { success: false, error: "Không có quyền gửi yêu cầu nghỉ." };
  }
  const data = parsed.data;
  const { data: requestId, error } = await ctx.supabase.rpc(
    "submit_leave_request",
    {
      p_branch_id: data.branchId,
      p_start_date: data.startDate,
      p_end_date: data.endDate,
      p_leave_type: data.leaveType,
      p_reason: data.reason,
    },
  );

  if (error) {
    if (error.message.includes("past date")) {
      return { success: false, error: "Không thể xin nghỉ cho ngày đã qua." };
    }
    if (error.message.includes("invalid date range")) {
      return { success: false, error: "Khoảng ngày nghỉ không hợp lệ." };
    }
    if (error.message.includes("invalid leave type")) {
      return { success: false, error: "Loại nghỉ không hợp lệ." };
    }
    if (error.message.includes("reason too long")) {
      return { success: false, error: "Lý do nghỉ quá dài." };
    }
    if (error.message.includes("overlaps")) {
      return {
        success: false,
        error: "Bạn đã có yêu cầu nghỉ trùng ngày đang chờ hoặc đã duyệt.",
      };
    }
    if (error.message.includes("no active employee")) {
      return {
        success: false,
        error: "Tài khoản chưa được liên kết hồ sơ nhân viên tại chi nhánh.",
      };
    }
    if (error.message.includes("branch not found")) {
      return {
        success: false,
        error: "Chi nhánh không tồn tại hoặc đã bị tắt.",
      };
    }
    if (error.message.includes("missing permission")) {
      return { success: false, error: "Không có quyền gửi yêu cầu nghỉ." };
    }
    if (error.code === "23505") {
      return {
        success: false,
        error: "Bạn đã có yêu cầu nghỉ trùng ngày.",
      };
    }
    return { success: false, error: "Không thể gửi yêu cầu nghỉ." };
  }

  return { success: true, data: { requestId } };
}

const cancelSchema = z.object({
  requestId: z.coerce.number().int().positive(),
});

export async function cancelLeaveRequest(
  input: unknown,
): Promise<ActionResult> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const ctx = await getEmployeeContext();
  if (!ctx || ctx.claims.user_role === "owner") {
    return { success: false, error: "Không có quyền huỷ yêu cầu nghỉ." };
  }
  const { error } = await ctx.supabase.rpc("cancel_leave_request", {
    p_request_id: parsed.data.requestId,
  });

  if (error) {
    if (error.message.includes("not the request owner")) {
      return { success: false, error: "Bạn không phải chủ yêu cầu này." };
    }
    if (error.message.includes("not pending")) {
      return {
        success: false,
        error: "Yêu cầu không còn ở trạng thái chờ duyệt.",
      };
    }
    if (error.message.includes("not found")) {
      return { success: false, error: "Không tìm thấy yêu cầu." };
    }
    return { success: false, error: "Không thể huỷ yêu cầu nghỉ." };
  }

  return { success: true };
}
