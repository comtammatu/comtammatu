"use server";

import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import { revalidatePath } from "next/cache";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { getAuthContextWithPermission } from "@/_lib/auth";

const OWNER_STAFF_ROLES = MODULE_ACL.staff.allowedRoles;

export const ROLE_BINDING_ERROR_CODES = {
  AAL2_REQUIRED: "aal2_required",
  SELF_SECURITY_REVOKE_FORBIDDEN: "self_security_revoke_forbidden",
  BINDING_SCOPE_INVALID: "binding_scope_invalid",
  BRANCH_NOT_FOUND: "branch_not_found",
  TARGET_NOT_FOUND: "target_not_found",
  ROLE_NOT_FOUND: "role_not_found",
} as const;

const roleBindingSchema = z.object({
  targetUserId: z.uuid(),
  roleCode: z.string().min(1).max(80),
  branchId: z.coerce.number().int().positive().nullable(),
  active: z.boolean(),
});

export async function setRoleBindingAction(
  input: z.input<typeof roleBindingSchema>,
): Promise<ActionResult> {
  const parsed = roleBindingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const ctx = await getAuthContextWithPermission(
    OWNER_STAFF_ROLES,
    PERMISSION_KEYS.AUTH_BINDING_MANAGE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { error } = await ctx.supabase.rpc("set_auth_role_binding", {
    p_target_user_id: parsed.data.targetUserId,
    p_role_code: parsed.data.roleCode,
    p_branch_id: parsed.data.branchId ?? undefined,
    p_active: parsed.data.active,
  });
  if (error) {
    const errorCode = classifyBindingError(error.message);
    return {
      success: false,
      error: mapBindingError(error.message),
      ...(errorCode ? { errorCode } : {}),
    };
  }
  revalidatePath(`/hr/staff/${parsed.data.targetUserId}/permissions`);
  revalidatePath("/hr");
  return { success: true };
}

function classifyBindingError(message: string): string | undefined {
  if (message.includes("aal2_required")) {
    return ROLE_BINDING_ERROR_CODES.AAL2_REQUIRED;
  }
  if (message.includes("self_security_revoke_forbidden")) {
    return ROLE_BINDING_ERROR_CODES.SELF_SECURITY_REVOKE_FORBIDDEN;
  }
  if (message.includes("binding_scope_invalid")) {
    return ROLE_BINDING_ERROR_CODES.BINDING_SCOPE_INVALID;
  }
  if (message.includes("branch_not_found")) {
    return ROLE_BINDING_ERROR_CODES.BRANCH_NOT_FOUND;
  }
  if (message.includes("target_not_found")) {
    return ROLE_BINDING_ERROR_CODES.TARGET_NOT_FOUND;
  }
  if (message.includes("role_not_found")) {
    return ROLE_BINDING_ERROR_CODES.ROLE_NOT_FOUND;
  }
  return undefined;
}

function mapBindingError(message: string): string {
  if (message.includes("aal2_required")) {
    return "Cần xác thực AAL2 trước khi thay đổi phân quyền.";
  }
  if (message.includes("self_security_revoke_forbidden")) {
    return "Không thể tự thu hồi quyền bảo mật của chính mình.";
  }
  if (message.includes("binding_scope_invalid")) {
    return "Phạm vi không phù hợp với vai trò hệ thống.";
  }
  if (message.includes("branch_not_found")) return "Chi nhánh không hợp lệ.";
  if (message.includes("target_not_found")) return "Nhân viên không tồn tại.";
  if (message.includes("role_not_found")) return "Vai trò không hợp lệ.";
  return "Không thể cập nhật phân quyền. Vui lòng thử lại.";
}
