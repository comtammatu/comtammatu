"use server";

import { z } from "zod";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import {
  MODULE_ACL,
  PERMISSION_KEYS,
  requiredBranchKindForPositionCode,
  staffRoleFromPositionCode,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";
import {
  getAuthContextWithPermission,
  getAuthContextWithPermissions,
} from "@/_lib/auth";

/* ─── Schemas ─── */

const createStaffSchema = z.object({
  email: z.string().email({ error: "Email không hợp lệ" }),
  password: z.string().min(8, { error: "Mật khẩu phải có ít nhất 8 ký tự" }),
  full_name: z.string().min(1, { error: "Họ tên không được để trống" }),
  phone: z.string().optional().default(""),
  position_code: z.string().min(1, { error: "Chức vụ không hợp lệ" }),
  branch_id: z.coerce.number().int().positive().optional(),
});

const updateStaffSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().min(1, { error: "Họ tên không được để trống" }),
  phone: z.string().optional().default(""),
  position_code: z.string().min(1, { error: "Chức vụ không hợp lệ" }),
  branch_id: z.coerce.number().int().positive().optional(),
});

/* ─── Helpers ─── */

/** Roles allowed to manage staff (aligned with proxy staff module ACL). */
const MANAGER_ROLES = MODULE_ACL.staff.allowedRoles;

const POSITION_ASSIGN_PERMISSIONS = [
  PERMISSION_KEYS.HR_MANAGE_EMPLOYEE,
  PERMISSION_KEYS.STAFF_ASSIGN_POSITION,
] as const;

type StaffActionClient = NonNullable<
  Awaited<ReturnType<typeof getAuthContextWithPermissions>>
>["supabase"];

function validateStaffAssignment(actorRole: string): string | null {
  if (actorRole === "owner") return null;
  return "Không có quyền quản lý nhân viên";
}

async function validatePositionSite(
  supabase: StaffActionClient,
  tenantId: number,
  positionCode: string,
  branchId: number | undefined,
): Promise<string | null> {
  const requiredBranchKind = requiredBranchKindForPositionCode(positionCode);
  if (requiredBranchKind === "unassigned") return "Chức vụ không hợp lệ";
  if (requiredBranchKind !== null && !branchId) {
    return "Chức vụ vận hành phải thuộc một địa điểm";
  }
  if (!branchId) return null;

  const { data: br } = await supabase
    .from("branches")
    .select("branch_kind")
    .eq("id", branchId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!br) return "Chi nhánh không hợp lệ";
  if (requiredBranchKind !== null && br.branch_kind !== requiredBranchKind) {
    return "Chức vụ này không thuộc loại địa điểm đã chọn.";
  }
  return null;
}

function mapRpcError(msg: string): string {
  if (msg.includes("target profile not found"))
    return "Nhân viên không tồn tại";
  if (msg.includes("target_profile_not_found_in_tenant"))
    return "Nhân viên không tồn tại";
  if (
    msg.includes("cannot modify owner") ||
    msg.includes("cannot_modify_owner")
  )
    return "Không có quyền chỉnh sửa chủ sở hữu";
  if (msg.includes("cannot set role above"))
    return "Không có quyền gán vai trò cao hơn";
  if (
    msg.includes("target not in your branch") ||
    msg.includes("branch_manager_target_not_in_branch")
  )
    return "Nhân viên không thuộc chi nhánh của bạn";
  if (
    msg.includes("cannot modify peer") ||
    msg.includes("branch_manager_cannot_modify_peer")
  )
    return "Không có quyền chỉnh sửa quản lý cùng cấp";
  if (
    msg.includes("can only assign") ||
    msg.includes("branch_manager_can_only_assign_branch_staff")
  )
    return "Bạn chỉ có thể gán nhân sự vận hành cấp chi nhánh";
  if (
    msg.includes("cannot reassign to other branch") ||
    msg.includes("branch_manager_cannot_reassign_branch")
  )
    return "Không có quyền chuyển nhân viên sang chi nhánh khác";
  if (
    msg.includes("operational roles require branch_id") ||
    msg.includes("branch_required_for_operational_position")
  )
    return "Vai trò vận hành phải thuộc một chi nhánh";
  if (
    msg.includes("branch_id does not belong") ||
    msg.includes("branch_not_found_in_tenant")
  )
    return "Chi nhánh không hợp lệ";
  if (msg.includes("position_site_kind_mismatch"))
    return "Chức vụ này không thuộc loại địa điểm đã chọn.";
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
    position_code: formData.get("position_code"),
    branch_id: formData.get("branch_id") || undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { email, password, full_name, position_code, branch_id } = parsed.data;
  const role = staffRoleFromPositionCode(position_code);
  if (role === "unassigned" || role === "owner") {
    return { success: false, error: "Chức vụ không hợp lệ" };
  }
  const effectiveBranchId = branch_id;

  const ctx = await getAuthContextWithPermissions(
    MANAGER_ROLES,
    POSITION_ASSIGN_PERMISSIONS,
    effectiveBranchId ?? null,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { claims, supabase, user } = ctx;

  const siteError = await validatePositionSite(
    supabase,
    claims.tenant_id,
    position_code,
    effectiveBranchId,
  );
  if (siteError) return { success: false, error: siteError };

  const assignmentError = validateStaffAssignment(claims.user_role);
  if (assignmentError) return { success: false, error: assignmentError };

  // Service role client for admin user creation
  const serviceClient = createServiceClient();

  const { error } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: {
      tenant_id: claims.tenant_id,
      branch_id: effectiveBranchId ?? null,
      position_code,
      full_name,
      provisioned_by: user.id,
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

  revalidateSurfacePath("/hr/staff");
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
    position_code: formData.get("position_code"),
    branch_id: formData.get("branch_id") || undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { id, full_name, phone, position_code, branch_id } = parsed.data;
  const role = staffRoleFromPositionCode(position_code);
  if (role === "unassigned" || role === "owner") {
    return { success: false, error: "Chức vụ không hợp lệ" };
  }
  const effectiveBranchId = branch_id;

  const ctx = await getAuthContextWithPermissions(
    MANAGER_ROLES,
    POSITION_ASSIGN_PERMISSIONS,
    effectiveBranchId ?? null,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const siteError = await validatePositionSite(
    supabase,
    claims.tenant_id,
    position_code,
    effectiveBranchId,
  );
  if (siteError) return { success: false, error: siteError };

  const assignmentError = validateStaffAssignment(claims.user_role);
  if (assignmentError) return { success: false, error: assignmentError };

  const { error } = await supabase.rpc("update_staff_profile", {
    p_target_id: id,
    p_full_name: full_name,
    p_phone: phone || undefined,
    p_position_code: position_code,
    p_branch_id: effectiveBranchId ?? undefined,
  });

  if (error) {
    return { success: false, error: mapRpcError(error.message) };
  }

  revalidateSurfacePath("/hr/staff");
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
    PERMISSION_KEYS.HR_MANAGE_EMPLOYEE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  const { error } = await supabase.rpc("toggle_profile_active", {
    p_target_id: parsedId.data,
  });

  if (error) {
    return { success: false, error: mapRpcError(error.message) };
  }

  revalidateSurfacePath("/hr/staff");
  return { success: true };
}
