"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@comtammatu/database/supabase/server";
import type { ActionResult } from "@comtammatu/shared/types";

const updateDependentsSchema = z.object({
  count: z.coerce.number().int().min(0).max(20),
});

export async function updateMyDependentsCount(input: {
  count: number;
}): Promise<ActionResult> {
  const parsed = updateDependentsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ?? "Số người phụ thuộc không hợp lệ",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_dependents_count", {
    p_count: parsed.data.count,
  });

  if (error) {
    if (error.message.includes("invalid count")) {
      return { success: false, error: "Số người phụ thuộc phải từ 0 đến 20" };
    }
    if (error.message.includes("no active employee record")) {
      return {
        success: false,
        error: "Tài khoản chưa được liên kết hồ sơ nhân viên đang hoạt động.",
      };
    }
    if (error.message.includes("missing auth context")) {
      return { success: false, error: "Chưa đăng nhập" };
    }
    return { success: false, error: "Không thể cập nhật. Vui lòng thử lại." };
  }

  revalidatePath("/employee/profile");
  return { success: true };
}
