"use server";

import { z } from "zod";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/_lib/auth";

const MODERATE_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
];

const bulkSchema = z.object({
  feedback_ids: z.array(z.number().int().positive()).min(1).max(100),
  is_suspect: z.boolean(),
});

export async function bulkMarkSuspect(
  input: unknown,
): Promise<ActionResult<{ updated: number }>> {
  const ctx = await getAuthContextWithPermission(
    MODERATE_ROLES,
    PERMISSION_KEYS.FEEDBACK_MODERATE,
  );
  if (!ctx) return { success: false, error: "Không có quyền moderate." };

  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { feedback_ids, is_suspect } = parsed.data;

  const { data, error } = await ctx.supabase.rpc("bulk_mark_feedback_suspect", {
    p_feedback_ids: feedback_ids,
    p_is_suspect: is_suspect,
  });

  if (error) {
    console.error("[bulkMarkSuspect] rpc error code=%s", error.code);
    return { success: false, error: "Không thể cập nhật trạng thái." };
  }

  return { success: true, data: { updated: (data as number) ?? 0 } };
}
