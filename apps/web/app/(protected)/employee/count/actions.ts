"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { STAFF_ROLES } from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";

const lineSchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
  countedQuantity: z.coerce.number().min(0).max(9_999_999),
  note: z.string().trim().max(500).optional(),
});

const submitSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  locationId: z.coerce.number().int().positive(),
  lines: z.array(lineSchema).min(1),
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
  return "Không thể gửi phiếu kiểm kê.";
}

export const submitCountSlip = withAction(
  {
    roles: STAFF_ROLES,
    schema: submitSchema,
  },
  async (data, { supabase }) => {
    const pLines = data.lines.map((line) => ({
      ingredient_id: line.ingredientId,
      counted_quantity: line.countedQuantity,
      ...(line.note ? { note: line.note } : {}),
    }));

    const { data: slipId, error } = await supabase.rpc(
      "submit_inventory_count_slip",
      {
        p_branch_id: data.branchId,
        p_location_id: data.locationId,
        p_lines: pLines,
      },
    );

    if (error) {
      return { success: false, error: mapSubmitError(error) };
    }

    revalidatePath("/employee/count");
    return { success: true, data: { slipId } };
  },
);
