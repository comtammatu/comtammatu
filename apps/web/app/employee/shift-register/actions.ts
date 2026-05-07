"use server";

import { z } from "zod";
import { PERMISSION_KEYS, STAFF_ROLES } from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";

const submitSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  shiftId: z.coerce.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    error: "Ngày không hợp lệ",
  }),
  note: z.string().max(500).optional(),
});

export const submitShiftRequest = withAction(
  {
    roles: STAFF_ROLES,
    schema: submitSchema,
    permission: PERMISSION_KEYS.HR_REGISTER_SHIFT,
  },
  async (data, { supabase }) => {
    const { data: requestId, error } = await supabase.rpc(
      "submit_shift_request",
      {
        p_branch_id: data.branchId,
        p_shift_id: data.shiftId,
        p_date: data.date,
        p_note: data.note ?? null,
      },
    );

    if (error) {
      if (error.message.includes("past date")) {
        return { success: false, error: "Không thể đăng ký cho ngày đã qua." };
      }
      if (error.message.includes("already assigned")) {
        return {
          success: false,
          error: "Bạn đã được phân ca này trong ngày.",
        };
      }
      if (error.message.includes("shift not found")) {
        return {
          success: false,
          error: "Ca không tồn tại hoặc đã bị tắt.",
        };
      }
      if (error.message.includes("no active employee")) {
        return {
          success: false,
          error: "Tài khoản chưa được liên kết với hồ sơ nhân viên.",
        };
      }
      if (error.message.includes("missing permission")) {
        return { success: false, error: "Không có quyền đăng ký ca." };
      }
      if (error.code === "23505") {
        return {
          success: false,
          error: "Bạn đã đăng ký ca này — chờ duyệt.",
        };
      }
      return { success: false, error: "Không thể đăng ký ca." };
    }

    return { success: true, data: { requestId } };
  },
);

const cancelSchema = z.object({
  requestId: z.coerce.number().int().positive(),
});

export const cancelShiftRequest = withAction(
  {
    roles: STAFF_ROLES,
    schema: cancelSchema,
    permission: PERMISSION_KEYS.HR_REGISTER_SHIFT,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc("cancel_shift_request", {
      p_request_id: data.requestId,
    });

    if (error) {
      if (error.message.includes("not the request owner")) {
        return {
          success: false,
          error: "Bạn không phải chủ đăng ký này.",
        };
      }
      if (error.message.includes("not pending")) {
        return {
          success: false,
          error: "Đăng ký không còn ở trạng thái chờ duyệt.",
        };
      }
      if (error.message.includes("not found")) {
        return { success: false, error: "Không tìm thấy đăng ký." };
      }
      return { success: false, error: "Không thể huỷ đăng ký." };
    }

    return { success: true };
  },
);

const fetchShiftsSchema = z.object({
  branchId: z.coerce.number().int().positive(),
});

export const fetchShiftsForRegister = withAction(
  {
    roles: STAFF_ROLES,
    schema: fetchShiftsSchema,
    permission: PERMISSION_KEYS.HR_REGISTER_SHIFT,
  },
  async (data, { supabase, claims }) => {
    const { data: result, error } = await supabase
      .from("shifts")
      .select("id, name, start_time, end_time")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", data.branchId)
      .eq("is_active", true)
      .order("start_time");

    if (error) {
      return { success: false, error: "Không thể tải ca làm." };
    }

    return { success: true, data: result ?? [] };
  },
);
