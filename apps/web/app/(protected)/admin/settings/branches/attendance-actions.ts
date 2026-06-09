"use server";

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";
import { getAuthContextWithPermission } from "../../_lib/auth";

const CONFIG_ROLES: readonly StaffRole[] = ["owner", "super_manager"];

/* ─── Schemas ─── */

const checklistSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  items: z.string().trim().min(1, { error: "Checklist không được trống" }),
});

/* ─── Actions ─── */

export async function saveBranchChecklist(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = checklistSchema.safeParse({
    branchId: formData.get("branchId"),
    items: formData.get("items"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Checklist không hợp lệ",
    };
  }

  const items = parsed.data.items
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length === 0) {
    return { success: false, error: "Checklist không được trống" };
  }
  if (items.length > 20) {
    return { success: false, error: "Checklist tối đa 20 việc" };
  }
  if (items.some((item) => item.length > 120)) {
    return { success: false, error: "Mỗi việc tối đa 120 ký tự" };
  }

  const ctx = await getAuthContextWithPermission(
    CONFIG_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { claims } = ctx;
  const { error } = await createServiceClient().rpc(
    "upsert_shift_checklist_template",
    {
      p_tenant_id: claims.tenant_id,
      p_branch_id: parsed.data.branchId,
      p_items: items,
    },
  );

  if (error) {
    return { success: false, error: "Không thể lưu checklist ca làm." };
  }

  revalidateSurfacePath("/admin/settings/branches");
  return { success: true };
}
