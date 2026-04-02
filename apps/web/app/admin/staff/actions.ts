"use server";

import { z } from "zod";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import type { StaffRole } from "@comtammatu/shared/auth";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const inviteStaffSchema = z.object({
  full_name: z.string().min(1, { error: "Vui lòng nhập họ tên" }),
  email: z.email({ error: "Email không hợp lệ" }),
  password: z.string().min(8, { error: "Mật khẩu tối thiểu 8 ký tự" }),
  role: z.enum([
    "owner",
    "super_manager",
    "area_manager",
    "branch_manager",
    "cashier",
    "waiter",
    "chef",
    "office",
  ] as const),
  branch_id: z.coerce.number().nullable(),
});

const updateStaffSchema = z.object({
  id: z.string().uuid({ error: "ID nhân viên không hợp lệ" }),
  role: z.enum([
    "owner",
    "super_manager",
    "area_manager",
    "branch_manager",
    "cashier",
    "waiter",
    "chef",
    "office",
  ] as const),
  branch_id: z.coerce.number().nullable(),
  is_active: z.boolean(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StaffRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: StaffRole;
  branch_id: number | null;
  branch_name: string | null;
  is_active: boolean;
  created_at: string;
}

export interface BranchOption {
  id: number;
  name: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAuthClaims() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return { supabase, claims: null };

  const claims = extractClaims(user.app_metadata);
  return { supabase, claims };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function getStaffList(): Promise<{
  success: boolean;
  data?: StaffRow[];
  error?: string;
}> {
  const { supabase, claims } = await getAuthClaims();
  if (!claims) return { success: false, error: "Chưa đăng nhập" };

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone, role, branch_id, is_active, created_at, branches(name)")
    .eq("tenant_id", claims.tenant_id)
    .order("created_at", { ascending: false });

  if (error) {
    return { success: false, error: "Không thể tải danh sách nhân viên" };
  }

  const rows: StaffRow[] = (data ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    phone: p.phone,
    role: p.role,
    branch_id: p.branch_id,
    branch_name:
      p.branches && !Array.isArray(p.branches) ? p.branches.name : null,
    is_active: p.is_active,
    created_at: p.created_at,
  }));

  return { success: true, data: rows };
}

export async function getBranches(): Promise<{
  success: boolean;
  data?: BranchOption[];
  error?: string;
}> {
  const { supabase, claims } = await getAuthClaims();
  if (!claims) return { success: false, error: "Chưa đăng nhập" };

  const { data, error } = await supabase
    .from("branches")
    .select("id, name")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name");

  if (error) {
    return { success: false, error: "Không thể tải danh sách chi nhánh" };
  }

  return { success: true, data: data ?? [] };
}

export async function inviteStaff(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const { supabase, claims } = await getAuthClaims();
  if (!claims) return { success: false, error: "Chưa đăng nhập" };

  const parsed = inviteStaffSchema.safeParse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
    branch_id: formData.get("branch_id") || null,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { full_name, email, password, role, branch_id } = parsed.data;

  // Roles that require a branch
  const branchRequiredRoles = ["branch_manager", "cashier", "waiter", "chef"];
  if (branchRequiredRoles.includes(role) && !branch_id) {
    return { success: false, error: "Vai trò này yêu cầu chọn chi nhánh" };
  }

  // TODO: This requires SUPABASE_SERVICE_ROLE_KEY via supabase.auth.admin.createUser().
  // Using regular client signUp for now — works in dev/testing environments only.
  // In production, replace with Admin API using a server-side service role client.
  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name,
        tenant_id: claims.tenant_id,
        branch_id: branch_id ?? null,
        user_role: role,
      },
    },
  });

  if (signUpError || !authData.user) {
    return { success: false, error: "Không thể tạo tài khoản nhân viên" };
  }

  return { success: true };
}

export async function updateStaff(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const { supabase, claims } = await getAuthClaims();
  if (!claims) return { success: false, error: "Chưa đăng nhập" };

  const parsed = updateStaffSchema.safeParse({
    id: formData.get("id"),
    role: formData.get("role"),
    branch_id: formData.get("branch_id") || null,
    is_active: formData.get("is_active") === "true",
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { id, role, branch_id, is_active } = parsed.data;

  // Verify the target profile belongs to the same tenant
  const { data: profile, error: fetchError } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", id)
    .single();

  if (fetchError || !profile || profile.tenant_id !== claims.tenant_id) {
    return { success: false, error: "Nhân viên không thuộc tổ chức của bạn" };
  }

  const { error } = await supabase.rpc("admin_update_profile", {
    p_target_id: id,
    p_role: role,
    p_branch_id: branch_id,
    p_is_active: is_active,
  });

  if (error) {
    return { success: false, error: "Không thể cập nhật thông tin nhân viên" };
  }

  return { success: true };
}

export async function toggleStaffActive(
  id: string,
  is_active: boolean,
): Promise<{ success: boolean; error?: string }> {
  if (!id) return { success: false, error: "ID không hợp lệ" };

  const { supabase, claims } = await getAuthClaims();
  if (!claims) return { success: false, error: "Chưa đăng nhập" };

  // Verify ownership
  const { data: profile, error: fetchError } = await supabase
    .from("profiles")
    .select("tenant_id, role, branch_id")
    .eq("id", id)
    .single();

  if (fetchError || !profile || profile.tenant_id !== claims.tenant_id) {
    return { success: false, error: "Nhân viên không thuộc tổ chức của bạn" };
  }

  const { error } = await supabase.rpc("admin_update_profile", {
    p_target_id: id,
    p_role: profile.role,
    p_branch_id: profile.branch_id,
    p_is_active: is_active,
  });

  if (error) {
    return { success: false, error: "Không thể cập nhật trạng thái nhân viên" };
  }

  return { success: true };
}
