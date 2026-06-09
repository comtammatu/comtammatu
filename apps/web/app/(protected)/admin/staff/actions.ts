"use server";

import { z } from "zod";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import {
  MODULE_ACL,
  PERMISSION_KEYS,
  STAFF_ROLES,
} from "@comtammatu/shared/auth";
import type { StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";
import {
  getAuthContextWithPermission,
  getAuthContextWithPermissions,
} from "../_lib/auth";

/* ─── Schemas ─── */

const createStaffSchema = z.object({
  email: z.string().email({ error: "Email không hợp lệ" }),
  password: z.string().min(8, { error: "Mật khẩu phải có ít nhất 8 ký tự" }),
  full_name: z.string().min(1, { error: "Họ tên không được để trống" }),
  phone: z.string().optional().default(""),
  role: z.enum(STAFF_ROLES, { error: "Vai trò không hợp lệ" }),
  branch_id: z.coerce.number().int().positive().optional(),
});

const updateStaffSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().min(1, { error: "Họ tên không được để trống" }),
  phone: z.string().optional().default(""),
  role: z.enum(STAFF_ROLES, { error: "Vai trò không hợp lệ" }),
  branch_id: z.coerce.number().int().positive().optional(),
});

/* ─── Helpers ─── */

const OPS_ROLES: StaffRole[] = ["cashier", "waiter", "chef", "branch_manager"];

/** Roles allowed to manage staff (aligned with proxy staff module ACL). */
const MANAGER_ROLES = MODULE_ACL.staff.allowedRoles;

const POSITION_ASSIGN_PERMISSIONS = [
  PERMISSION_KEYS.STAFF_MANAGE,
  PERMISSION_KEYS.STAFF_ASSIGN_POSITION,
] as const;

/** Max role each actor can assign (hierarchy ceiling) */
function canAssignRole(
  actorRole: StaffRole,
  targetRole: StaffRole,
): string | null {
  if (actorRole === "owner") return null; // unrestricted
  if (actorRole === "super_manager") {
    if (targetRole === "owner") return "Không có quyền tạo chủ sở hữu";
    return null;
  }
  if (actorRole === "branch_manager") {
    if (!["cashier", "waiter", "chef"].includes(targetRole))
      return "Bạn chỉ có thể tạo thu ngân/phục vụ/bếp";
    return null;
  }
  return "Không có quyền quản lý nhân viên";
}

function mapRpcError(msg: string): string {
  if (msg.includes("target profile not found"))
    return "Nhân viên không tồn tại";
  if (msg.includes("cannot modify owner"))
    return "Không có quyền chỉnh sửa chủ sở hữu";
  if (msg.includes("cannot modify owner/super_manager"))
    return "Không có quyền chỉnh sửa cấp trên";
  if (msg.includes("cannot set role above"))
    return "Không có quyền gán vai trò cao hơn";
  if (msg.includes("target not in your branch"))
    return "Nhân viên không thuộc chi nhánh của bạn";
  if (msg.includes("cannot modify peer"))
    return "Không có quyền chỉnh sửa quản lý cùng cấp";
  if (msg.includes("can only assign"))
    return "Bạn chỉ có thể gán vai trò thu ngân/phục vụ/bếp";
  if (msg.includes("cannot reassign to other branch"))
    return "Không có quyền chuyển nhân viên sang chi nhánh khác";
  if (msg.includes("operational roles require branch_id"))
    return "Vai trò vận hành phải thuộc một chi nhánh";
  if (msg.includes("branch_id does not belong"))
    return "Chi nhánh không hợp lệ";
  if (msg.includes("operational roles cannot be assigned to central_warehouse"))
    return "Kho tổng / bếp trung tâm không có POS/KDS — không gán vai trò vận hành tại đây";
  if (msg.includes("insufficient privileges"))
    return "Không có quyền quản lý nhân viên";
  return "Không thể cập nhật. Vui lòng thử lại.";
}

/* ─── Actions ─── */

export async function createStaff(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createStaffSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    full_name: formData.get("full_name"),
    phone: formData.get("phone"),
    role: formData.get("role"),
    branch_id: formData.get("branch_id") || undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { email, password, full_name, role, branch_id } = parsed.data;

  // Operational roles must have branch_id
  if (OPS_ROLES.includes(role) && !branch_id) {
    return {
      success: false,
      error: "Vai trò vận hành phải thuộc một chi nhánh",
    };
  }

  const ctx = await getAuthContextWithPermissions(
    MANAGER_ROLES,
    POSITION_ASSIGN_PERMISSIONS,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { claims, supabase } = ctx;

  // Hierarchy ceiling — can't create roles above your level
  const roleError = canAssignRole(claims.user_role, role);
  if (roleError) {
    return { success: false, error: roleError };
  }

  // Branch managers can only create staff in their own branch
  if (claims.user_role === "branch_manager") {
    if (branch_id !== claims.branch_id) {
      return {
        success: false,
        error: "Không có quyền tạo nhân viên ở chi nhánh khác",
      };
    }
  }

  if (OPS_ROLES.includes(role) && branch_id) {
    const { data: br } = await supabase
      .from("branches")
      .select("branch_kind")
      .eq("id", branch_id)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle();
    if (
      br?.branch_kind === "central_warehouse" ||
      br?.branch_kind === "central_kitchen"
    ) {
      return {
        success: false,
        error:
          "Kho tổng / bếp trung tâm không có POS/KDS — không gán vai trò vận hành tại đây",
      };
    }
  }

  // Service role client for admin user creation
  const serviceClient = createServiceClient();

  const { error } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: {
      tenant_id: claims.tenant_id,
      branch_id: branch_id ?? null,
      role,
      full_name,
    },
    user_metadata: {
      full_name,
    },
  });

  if (error) {
    if (
      error.message?.includes("already been registered") ||
      error.message?.includes("already exists")
    ) {
      return { success: false, error: "Email này đã được sử dụng" };
    }
    return {
      success: false,
      error: "Không thể tạo tài khoản. Vui lòng thử lại.",
    };
  }

  revalidateSurfacePath("/admin/staff");
  return { success: true };
}

export async function updateStaff(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateStaffSchema.safeParse({
    id: formData.get("id"),
    full_name: formData.get("full_name"),
    phone: formData.get("phone"),
    role: formData.get("role"),
    branch_id: formData.get("branch_id") || undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { id, full_name, phone, role, branch_id } = parsed.data;

  // Operational roles must have branch_id
  if (OPS_ROLES.includes(role) && !branch_id) {
    return {
      success: false,
      error: "Vai trò vận hành phải thuộc một chi nhánh",
    };
  }

  const ctx = await getAuthContextWithPermissions(
    MANAGER_ROLES,
    POSITION_ASSIGN_PERMISSIONS,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // Hierarchy ceiling — can't assign roles above your level
  const roleError = canAssignRole(claims.user_role, role);
  if (roleError) {
    return { success: false, error: roleError };
  }

  const { error } = await supabase.rpc("admin_update_profile", {
    p_target_id: id,
    p_full_name: full_name,
    p_phone: phone || undefined,
    p_role: role,
    p_branch_id: branch_id ?? undefined,
  });

  if (error) {
    return { success: false, error: mapRpcError(error.message) };
  }

  revalidateSurfacePath("/admin/staff");
  return { success: true };
}

const staffIdSchema = z.string().uuid({ error: "ID nhân viên không hợp lệ" });

export async function toggleStaffActive(
  staffId: string,
): Promise<ActionResult> {
  const parsedId = staffIdSchema.safeParse(staffId);
  if (!parsedId.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContextWithPermission(
    MANAGER_ROLES,
    PERMISSION_KEYS.STAFF_MANAGE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  const { error } = await supabase.rpc("toggle_profile_active", {
    p_target_id: parsedId.data,
  });

  if (error) {
    return { success: false, error: mapRpcError(error.message) };
  }

  revalidateSurfacePath("/admin/staff");
  return { success: true };
}
