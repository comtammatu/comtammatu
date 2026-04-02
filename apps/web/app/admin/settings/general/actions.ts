"use server";

import { z } from "zod";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";

interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export type TenantRow = {
  id: number;
  name: string;
  slug: string;
  legal_name: string | null;
  tax_code: string | null;
  legal_address: string | null;
  representative: string | null;
};

const tenantUpdateSchema = z.object({
  name: z.string().min(1, { error: "Tên cửa hàng không được để trống" }),
  legal_name: z.string().optional(),
  tax_code: z.string().optional(),
  legal_address: z.string().optional(),
  representative: z.string().optional(),
});

async function getAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, tenantId: null, userRole: null };

  const claims = extractClaims(user.app_metadata);
  return {
    supabase,
    tenantId: claims?.tenant_id ?? null,
    userRole: claims?.user_role ?? null,
  };
}

export async function getTenantInfo(): Promise<ActionResult<TenantRow>> {
  const { supabase, tenantId } = await getAuthContext();

  if (!tenantId) return { success: false, error: "Không có quyền truy cập" };

  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, slug, legal_name, tax_code, legal_address, representative")
    .eq("id", tenantId)
    .single();

  if (error || !data) return { success: false, error: "Không thể tải thông tin cửa hàng" };

  return { success: true, data };
}

export async function updateTenantInfo(
  formData: z.infer<typeof tenantUpdateSchema>,
): Promise<ActionResult<TenantRow>> {
  const { supabase, tenantId, userRole } = await getAuthContext();

  if (!tenantId) return { success: false, error: "Không có quyền truy cập" };

  if (userRole !== "owner" && userRole !== "super_manager") {
    return { success: false, error: "Chỉ chủ sở hữu hoặc quản lý cấp cao mới có thể cập nhật thông tin này" };
  }

  const parsed = tenantUpdateSchema.safeParse(formData);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { data, error } = await supabase
    .from("tenants")
    .update({
      name: parsed.data.name,
      legal_name: parsed.data.legal_name ?? null,
      tax_code: parsed.data.tax_code ?? null,
      legal_address: parsed.data.legal_address ?? null,
      representative: parsed.data.representative ?? null,
    })
    .eq("id", tenantId)
    .select("id, name, slug, legal_name, tax_code, legal_address, representative")
    .single();

  if (error) return { success: false, error: "Không thể cập nhật thông tin cửa hàng" };

  return { success: true, data };
}
