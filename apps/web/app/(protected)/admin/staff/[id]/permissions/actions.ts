"use server";

import { z } from "zod";
import { createClient } from "@comtammatu/database/supabase/server";
import type { ActionResult } from "@comtammatu/shared/types";
import { revalidatePath } from "next/cache";

/* ─── Schemas ─── */

const grantSchema = z.object({
  target_user_id: z.uuid(),
  branch_id: z.coerce.number().int().positive().nullable(),
  permission_key: z.string().min(1),
  // ISO 8601 string (datetime-local input); empty → permanent
  valid_until: z.string().datetime({ offset: true }).optional().nullable(),
});

const revokeSchema = z.object({
  target_user_id: z.uuid(),
  branch_id: z.coerce.number().int().positive().nullable(),
  permission_key: z.string().min(1),
});

/* ─── grant ─── */

export async function grantPermissionAction(
  input: z.input<typeof grantSchema>,
): Promise<ActionResult<{ grant_id: number }>> {
  const parsed = grantSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  if (parsed.data.branch_id === null) {
    return { success: false, error: "Vui lòng chọn chi nhánh." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("grant_permission", {
    p_target_user: parsed.data.target_user_id,
    p_branch_id: parsed.data.branch_id,
    p_permission_key: parsed.data.permission_key,
    p_source_template: undefined,
    p_valid_until: parsed.data.valid_until ?? undefined,
  });
  if (error) return { success: false, error: mapRpcError(error.message) };
  revalidatePath(`/admin/staff/${parsed.data.target_user_id}/permissions`);
  return { success: true, data: { grant_id: data as number } };
}

/* ─── revoke ─── */

export async function revokePermissionAction(
  input: z.input<typeof revokeSchema>,
): Promise<ActionResult<{ rows_removed: number }>> {
  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  if (parsed.data.branch_id === null) {
    return { success: false, error: "Vui lòng chọn chi nhánh." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revoke_permission", {
    p_target_user: parsed.data.target_user_id,
    p_branch_id: parsed.data.branch_id,
    p_permission_key: parsed.data.permission_key,
  });
  if (error) return { success: false, error: mapRpcError(error.message) };
  revalidatePath(`/admin/staff/${parsed.data.target_user_id}/permissions`);
  return { success: true, data: { rows_removed: data as number } };
}

/* ─── error mapping — never leak raw pg messages ─── */

function mapRpcError(msg: string): string {
  if (msg.includes("missing staff:assign_permission"))
    return "Bạn không có quyền gán/thu hồi quyền hạn.";
  if (msg.includes("cannot_manage_owner_permissions"))
    return "Không thể thay đổi quyền của chủ sở hữu.";
  if (msg.includes("target_not_in_tenant"))
    return "Người dùng không thuộc tenant.";
  if (msg.includes("branch_not_in_tenant"))
    return "Chi nhánh không thuộc tenant.";
  if (msg.includes("unknown_permission_key"))
    return "Permission key không hợp lệ.";
  if (msg.includes("template_not_in_tenant"))
    return "Template không thuộc tenant.";
  if (msg.includes("invalid_validity_window"))
    return "Hạn kết thúc phải sau thời điểm bắt đầu.";
  if (msg.includes("not_authenticated")) return "Chưa đăng nhập.";
  return "Lỗi hệ thống. Vui lòng thử lại.";
}
