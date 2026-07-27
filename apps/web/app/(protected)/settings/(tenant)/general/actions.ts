"use server";

import { z } from "zod";
import {
  PERMISSION_KEYS,
  TENANT_STRATEGY_SETTINGS_ROLES,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";

const tenantIdentitySchema = z.object({
  legal_name: z.string().trim(),
  tax_code: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{10}(-\d{3})?$/.test(v), {
      error: "Mã số thuế phải là 10 chữ số hoặc 13 chữ số có dấu gạch nối",
    }),
  legal_address: z.string().trim(),
  representative: z.string().trim(),
});

const activateInvoiceProfileSchema = z.object({}).strict();

export async function updateTenantIdentity(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const raw = {
    legal_name: (formData.get("legal_name") ?? "").toString(),
    tax_code: (formData.get("tax_code") ?? "").toString(),
    legal_address: (formData.get("legal_address") ?? "").toString(),
    representative: (formData.get("representative") ?? "").toString(),
  };

  const parsed = tenantIdentitySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    TENANT_STRATEGY_SETTINGS_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;

  const { error } = await supabase.rpc("update_tenant_identity", {
    p_legal_name: parsed.data.legal_name,
    p_tax_code: parsed.data.tax_code,
    p_legal_address: parsed.data.legal_address,
    p_representative: parsed.data.representative,
  });

  if (error) {
    return {
      success: false,
      error: "Không thể lưu định danh doanh nghiệp. Vui lòng thử lại.",
    };
  }

  revalidateSurfacePath("/settings/general");
  return { success: true };
}

export async function activateInvoiceProfile(
  input: unknown,
): Promise<ActionResult<{ profileId: number }>> {
  const parsed = activateInvoiceProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    TENANT_STRATEGY_SETTINGS_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { data, error } = await ctx.supabase.rpc("activate_invoice_profile");
  if (error) {
    if (error.code === "23514") {
      return {
        success: false,
        error: "Hồ sơ pháp lý chưa đầy đủ hoặc mã số thuế không khớp.",
      };
    }
    if (error.code === "P0002") {
      return {
        success: false,
        error: "Không tìm thấy cấu hình HĐĐT để kích hoạt.",
      };
    }
    if (error.code === "42501") {
      return { success: false, error: "Không có quyền" };
    }
    return {
      success: false,
      error: "Không thể kích hoạt HĐĐT. Vui lòng thử lại.",
    };
  }
  if (typeof data !== "number" || !Number.isSafeInteger(data) || data <= 0) {
    return {
      success: false,
      error: "Không thể xác nhận trạng thái kích hoạt HĐĐT.",
    };
  }

  revalidateSurfacePath("/settings/general");
  return { success: true, data: { profileId: data } };
}
