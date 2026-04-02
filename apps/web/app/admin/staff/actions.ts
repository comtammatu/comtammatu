"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@comtammatu/database/supabase/server";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { extractClaims, STAFF_ROLES } from "@comtammatu/shared/auth";
import type { StaffRole } from "@comtammatu/shared/auth";

/* ─── Schemas ─── */

const createStaffSchema = z.object({
  email: z.string().email({ error: "Email không hợp lệ" }),
  password: z
    .string()
    .min(8, { error: "Mật khẩu phải có ít nhất 8 ký tự" }),
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

/* ─── Types ─── */

interface ActionResult {
  success: boolean;
  error?: string;
}

/* ─── Helpers ─── */

const OPS_ROLES: StaffRole[] = [
  "cashier",
  "waiter",
  "chef",
  "branch_manager",
];

/** Roles allowed to manage staff (mirrors admin_update_profile RPC) */
const MANAGER_ROLES: StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
];

/** Max role each actor can assign (hierarchy ceiling) */
function canAssignRole(actorRole: StaffRole, targetRole: StaffRole): string | null {
  if (actorRole === "owner") return null; // unrestricted
  if (actorRole === "super_manager") {
    if (targetRole === "owner") return "Không có quyền tạo chủ sở hữu";
    return null;
  }
  if (actorRole === "area_manager") {
    if (["owner", "super_manager", "area_manager"].includes(targetRole))
      return "Không có quyền gán vai trò cao hơn quản lý chi nhánh";
    return null;
  }
  if (actorRole === "branch_manager") {
    if (!["cashier", "waiter", "chef"].includes(targetRole))
      return "Bạn chỉ có thể tạo thu ngân/phục vụ/bếp";
    return null;
  }
  return "Không có quyền quản lý nhân viên";
}

async function getAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const claims = extractClaims(user.app_metadata);
  if (!claims) return null;

  return { supabase, claims };
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

  const { email, password, full_name, phone, role, branch_id } = parsed.data;

  // Operational roles must have branch_id
  if (OPS_ROLES.includes(role) && !branch_id) {
    return {
      success: false,
      error: "Vai trò vận hành phải thuộc một chi nhánh",
    };
  }

  const ctx = await getAuthContext();
  if (!ctx) return { success: false, error: "Chưa đăng nhập" };

  const { claims } = ctx;

  // Role authorization — must be manager+
  if (!MANAGER_ROLES.includes(claims.user_role)) {
    return { success: false, error: "Không có quyền quản lý nhân viên" };
  }

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

  revalidatePath("/admin/staff");
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

  const ctx = await getAuthContext();
  if (!ctx) return { success: false, error: "Chưa đăng nhập" };

  const { supabase } = ctx;

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

  revalidatePath("/admin/staff");
  return { success: true };
}

export async function toggleStaffActive(
  staffId: string,
): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { success: false, error: "Chưa đăng nhập" };

  const { supabase, claims } = ctx;

  // Fetch current state
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", staffId)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (!profile) {
    return { success: false, error: "Nhân viên không tồn tại" };
  }

  const { error } = await supabase.rpc("admin_update_profile", {
    p_target_id: staffId,
    p_is_active: !(profile.is_active ?? true),
  });

  if (error) {
    return { success: false, error: mapRpcError(error.message) };
  }

  revalidatePath("/admin/staff");
  return { success: true };
}
