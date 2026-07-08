"use server";

import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import { revalidatePath } from "next/cache";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { getAuthContextWithPermission } from "@/_lib/auth";

function rpcBranchId(branchId: number | null): number {
  // Supabase generated RPC arg types do not encode nullable BIGINT inputs.
  return branchId as number;
}

const STAFF_ADMIN_ROLES = MODULE_ACL.staff.allowedRoles;

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

const applyTemplateSchema = z.object({
  target_user_id: z.uuid(),
  branch_id: z.coerce.number().int().positive().nullable(),
  template_id: z.coerce.number().int().positive(),
  valid_until: z.string().datetime({ offset: true }).optional().nullable(),
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
  const ctx = await getAuthContextWithPermission(
    STAFF_ADMIN_ROLES,
    PERMISSION_KEYS.STAFF_ASSIGN_PERMISSION,
    parsed.data.branch_id,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("grant_permission", {
    p_target_user: parsed.data.target_user_id,
    p_branch_id: rpcBranchId(parsed.data.branch_id),
    p_permission_key: parsed.data.permission_key,
    p_source_template: undefined,
    p_valid_until: parsed.data.valid_until ?? undefined,
  });
  if (error) return { success: false, error: mapRpcError(error.message) };
  revalidatePath(`/hr/staff/${parsed.data.target_user_id}/permissions`);
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
  const ctx = await getAuthContextWithPermission(
    STAFF_ADMIN_ROLES,
    PERMISSION_KEYS.STAFF_ASSIGN_PERMISSION,
    parsed.data.branch_id,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("revoke_permission", {
    p_target_user: parsed.data.target_user_id,
    p_branch_id: rpcBranchId(parsed.data.branch_id),
    p_permission_key: parsed.data.permission_key,
  });
  if (error) return { success: false, error: mapRpcError(error.message) };
  revalidatePath(`/hr/staff/${parsed.data.target_user_id}/permissions`);
  return { success: true, data: { rows_removed: data as number } };
}

/* ─── apply template ─── */

export async function applyTemplateAction(
  input: z.input<typeof applyTemplateSchema>,
): Promise<ActionResult<{ rows_inserted: number }>> {
  const parsed = applyTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const ctx = await getAuthContextWithPermission(
    STAFF_ADMIN_ROLES,
    PERMISSION_KEYS.STAFF_ASSIGN_PERMISSION,
    parsed.data.branch_id,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("apply_template_to_user", {
    p_target_user: parsed.data.target_user_id,
    p_branch_id: rpcBranchId(parsed.data.branch_id),
    p_template_id: parsed.data.template_id,
    p_valid_until: parsed.data.valid_until ?? undefined,
  });
  if (error) return { success: false, error: mapRpcError(error.message) };
  revalidatePath(`/hr/staff/${parsed.data.target_user_id}/permissions`);
  return { success: true, data: { rows_inserted: data as number } };
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
  if (msg.includes("unknown_permission_key_in_template"))
    return "Template có permission key không hợp lệ.";
  if (msg.includes("unknown_permission_key"))
    return "Permission key không hợp lệ.";
  if (msg.includes("template_not_in_tenant"))
    return "Template không thuộc tenant.";
  if (msg.includes("permission_scope_requires_branch"))
    return "Quyền này cần chọn chi nhánh.";
  if (msg.includes("permission_scope_requires_tenant"))
    return "Quyền này phải gán ở phạm vi toàn quán.";
  if (msg.includes("permission_scope_mismatch"))
    return "Template không khớp phạm vi. Chọn lại phạm vi phù hợp.";
  if (msg.includes("cannot_self_assign_permissions"))
    return "Không thể tự thay đổi quyền của chính mình.";
  if (msg.includes("invalid_validity_window"))
    return "Hạn kết thúc phải sau thời điểm bắt đầu.";
  if (msg.includes("not_authenticated")) return "Chưa đăng nhập.";
  return "Lỗi hệ thống. Vui lòng thử lại.";
}
