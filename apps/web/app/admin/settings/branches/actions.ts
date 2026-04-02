"use server";

import { z } from "zod";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";

const branchSchema = z.object({
  name: z.string().min(1, { error: "Tên chi nhánh không được để trống" }),
  address: z.string().optional(),
  phone: z.string().optional(),
  is_headquarters: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

type BranchInput = z.infer<typeof branchSchema>;

interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

async function getAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, tenantId: null };

  const claims = extractClaims(user.app_metadata);
  return { supabase, tenantId: claims?.tenant_id ?? null };
}

export async function getBranches(): Promise<
  ActionResult<
    Array<{
      id: number;
      tenant_id: number;
      name: string;
      address: string | null;
      phone: string | null;
      is_active: boolean;
      is_headquarters: boolean;
      created_at: string;
      updated_at: string;
    }>
  >
> {
  const { supabase, tenantId } = await getAuthContext();

  if (!tenantId) {
    return { success: false, error: "Không có quyền truy cập" };
  }

  const { data, error } = await supabase
    .from("branches")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error) {
    return { success: false, error: "Không thể tải danh sách chi nhánh" };
  }

  return { success: true, data: data ?? [] };
}

export async function createBranch(
  formData: BranchInput,
): Promise<ActionResult> {
  const { supabase, tenantId } = await getAuthContext();

  if (!tenantId) {
    return { success: false, error: "Không có quyền truy cập" };
  }

  const parsed = branchSchema.safeParse(formData);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { data, error } = await supabase
    .from("branches")
    .insert({
      tenant_id: tenantId,
      name: parsed.data.name,
      address: parsed.data.address ?? null,
      phone: parsed.data.phone ?? null,
      is_headquarters: parsed.data.is_headquarters ?? false,
      is_active: parsed.data.is_active ?? true,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: "Không thể tạo chi nhánh" };
  }

  return { success: true, data };
}

export async function updateBranch(
  id: number,
  formData: BranchInput,
): Promise<ActionResult> {
  const { supabase, tenantId } = await getAuthContext();

  if (!tenantId) {
    return { success: false, error: "Không có quyền truy cập" };
  }

  const parsed = branchSchema.safeParse(formData);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  // Verify ownership before update
  const { data: existing } = await supabase
    .from("branches")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (!existing) {
    return { success: false, error: "Chi nhánh không tồn tại" };
  }

  const { data, error } = await supabase
    .from("branches")
    .update({
      name: parsed.data.name,
      address: parsed.data.address ?? null,
      phone: parsed.data.phone ?? null,
      is_headquarters: parsed.data.is_headquarters ?? false,
      is_active: parsed.data.is_active ?? true,
    })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) {
    return { success: false, error: "Không thể cập nhật chi nhánh" };
  }

  return { success: true, data };
}

export async function toggleBranchActive(
  id: number,
  is_active: boolean,
): Promise<ActionResult> {
  const { supabase, tenantId } = await getAuthContext();

  if (!tenantId) {
    return { success: false, error: "Không có quyền truy cập" };
  }

  // Verify ownership before update
  const { data: existing } = await supabase
    .from("branches")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (!existing) {
    return { success: false, error: "Chi nhánh không tồn tại" };
  }

  const { data, error } = await supabase
    .from("branches")
    .update({ is_active })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) {
    return { success: false, error: "Không thể cập nhật trạng thái" };
  }

  return { success: true, data };
}
