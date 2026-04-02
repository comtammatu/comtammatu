"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";

/* ─── Schemas ─── */

const branchSchema = z.object({
  name: z.string().min(1, { error: "Tên chi nhánh không được để trống" }),
  address: z.string().optional().default(""),
  phone: z.string().optional().default(""),
});

const updateBranchSchema = branchSchema.extend({
  id: z.coerce.number().int().positive(),
});

/* ─── Types ─── */

interface ActionResult {
  success: boolean;
  error?: string;
}

/* ─── Helpers ─── */

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

/* ─── Actions ─── */

export async function createBranch(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = branchSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address"),
    phone: formData.get("phone"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext();
  if (!ctx) return { success: false, error: "Chưa đăng nhập" };

  const { supabase, claims } = ctx;

  const { error } = await supabase.from("branches").insert({
    tenant_id: claims.tenant_id,
    name: parsed.data.name,
    address: parsed.data.address || null,
    phone: parsed.data.phone || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Tên chi nhánh đã tồn tại" };
    }
    return { success: false, error: "Không thể tạo chi nhánh. Vui lòng thử lại." };
  }

  revalidatePath("/admin/settings/branches");
  return { success: true };
}

export async function updateBranch(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateBranchSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    address: formData.get("address"),
    phone: formData.get("phone"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext();
  if (!ctx) return { success: false, error: "Chưa đăng nhập" };

  const { supabase, claims } = ctx;

  const { error } = await supabase
    .from("branches")
    .update({
      name: parsed.data.name,
      address: parsed.data.address || null,
      phone: parsed.data.phone || null,
    })
    .eq("id", parsed.data.id)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Tên chi nhánh đã tồn tại" };
    }
    return { success: false, error: "Không thể cập nhật. Vui lòng thử lại." };
  }

  revalidatePath("/admin/settings/branches");
  return { success: true };
}

export async function toggleBranchActive(
  branchId: number,
): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { success: false, error: "Chưa đăng nhập" };

  const { supabase, claims } = ctx;

  // Fetch current state
  const { data: branch } = await supabase
    .from("branches")
    .select("is_active")
    .eq("id", branchId)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (!branch) {
    return { success: false, error: "Chi nhánh không tồn tại" };
  }

  const { error } = await supabase
    .from("branches")
    .update({ is_active: !(branch.is_active ?? true) })
    .eq("id", branchId)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return { success: false, error: "Không thể cập nhật. Vui lòng thử lại." };
  }

  revalidatePath("/admin/settings/branches");
  return { success: true };
}

export async function setHeadquarters(
  branchId: number,
): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { success: false, error: "Chưa đăng nhập" };

  const { supabase } = ctx;

  // Atomic RPC — avoids TOCTOU race from two separate UPDATEs
  const { error } = await supabase.rpc("set_headquarters", {
    p_branch_id: branchId,
  });

  if (error) {
    return { success: false, error: "Không thể cập nhật. Vui lòng thử lại." };
  }

  revalidatePath("/admin/settings/branches");
  return { success: true };
}
