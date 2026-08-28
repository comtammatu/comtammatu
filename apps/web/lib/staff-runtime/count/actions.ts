"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { STAFF_ROLES } from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";

const lineSchema = z.object({
  lineId: z.coerce.number().int().positive().optional(),
  ingredientId: z.coerce.number().int().positive(),
  countedQuantity: z.coerce.number().min(0).max(9_999_999),
  // Unit the physical count was entered in. submit_inventory_count_slip
  // converts it to the ingredient base via inv_to_base(). null => already base.
  entryUnitId: z.coerce.number().int().positive().nullable().optional(),
  note: z.string().trim().max(500).optional(),
});

const submitSchema = z
  .object({
    branchId: z.coerce.number().int().positive(),
    locationId: z.coerce.number().int().positive(),
    shiftId: z.coerce.number().int().positive().nullable().optional(),
    slipId: z.coerce.number().int().positive().optional(),
    recountRound: z.coerce.number().int().positive().optional(),
    lines: z.array(lineSchema).min(1),
  })
  .superRefine((data, ctx) => {
    const recounting = data.slipId !== undefined || data.recountRound !== undefined;
    if (recounting && (data.slipId === undefined || data.recountRound === undefined)) {
      ctx.addIssue({ code: "custom", path: ["slipId"], message: "Phiếu đếm lại không hợp lệ." });
    }
    if (recounting && data.lines.some((line) => line.lineId === undefined)) {
      ctx.addIssue({ code: "custom", path: ["lines"], message: "Dòng đếm lại không hợp lệ." });
    }
  });

function mapSubmitError(error: { message: string; code?: string }): string {
  const message = error.message;
  if (message.includes("incomplete_count")) {
    return "Phải đếm đủ tất cả nguyên liệu được giao.";
  }
  if (message.includes("empty_count")) {
    return "Chưa nhập số đếm nào.";
  }
  if (message.includes("slip_already_approved")) {
    return "Phiếu hôm nay đã được duyệt, không thể sửa.";
  }
  if (message.includes("not_assigned")) {
    return "Bạn không được giao đếm nguyên liệu này.";
  }
  if (message.includes("no_active_employee_in_branch")) {
    return "Tài khoản chưa được liên kết hồ sơ nhân viên tại chi nhánh.";
  }
  if (message.includes("forbidden")) {
    return "Không có quyền gửi phiếu kiểm kê.";
  }
  if (message.includes("recount_payload_set_mismatch")) {
    return "Phải gửi đủ và đúng các nguyên liệu được yêu cầu đếm lại.";
  }
  if (message.includes("recount_round_stale")) {
    return "Yêu cầu đếm lại đã thay đổi. Vui lòng tải lại phiếu.";
  }
  if (message.includes("recount_line_unit_invalid")) {
    return "Đơn vị đếm không thuộc nguyên liệu.";
  }
  return "Không thể gửi phiếu kiểm kê.";
}

export const submitCountSlip = withAction(
  {
    roles: STAFF_ROLES,
    schema: submitSchema,
  },
  async (data, { supabase }) => {
    const pLines = data.lines.map((line) => ({
      ...(line.lineId === undefined ? {} : { line_id: line.lineId }),
      ingredient_id: line.ingredientId,
      counted_quantity: line.countedQuantity,
      entry_unit_id: line.entryUnitId ?? null,
      ...(line.note ? { note: line.note } : {}),
    }));

    const { data: rpcResult, error } =
      data.slipId !== undefined && data.recountRound !== undefined
        ? await supabase.rpc("resubmit_inventory_count_slip_lines", {
            p_slip_id: data.slipId,
            p_recount_round: data.recountRound,
            p_lines: pLines,
          })
        : await supabase.rpc("submit_inventory_count_slip", {
            p_branch_id: data.branchId,
            p_location_id: data.locationId,
            p_lines: pLines,
            ...(data.shiftId == null ? {} : { p_shift_id: data.shiftId }),
          });

    if (error) {
      return { success: false, error: mapSubmitError(error) };
    }

    revalidatePath(`/br/${data.branchId}/stock/count`);
    revalidatePath(`/br/${data.branchId}/shift`);
    revalidatePath(`/br/${data.branchId}/team`);
    const slipId =
      data.slipId ??
      (typeof rpcResult === "number"
        ? rpcResult
        : Number((rpcResult as Record<string, unknown> | null)?.slip_id ?? 0));
    return { success: true, data: { slipId } };
  },
);
