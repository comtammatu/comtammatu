"use server";

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  GENERAL_SYSTEM_SETTING_KEYS,
  SYSTEM_SETTING_KEYS,
} from "@comtammatu/shared/settings";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";

const SETTINGS_ROLES: readonly StaffRole[] = ["owner"];

const settingsSchema = z.object({
  [SYSTEM_SETTING_KEYS.VAT_RATE]: z
    .string()
    .min(1, { error: "Thuế VAT không được để trống" })
    .refine((v) => !isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100, {
      error: "Thuế VAT phải từ 0-100%",
    }),
  [SYSTEM_SETTING_KEYS.SERVICE_CHARGE]: z
    .string()
    .min(1, { error: "Phí dịch vụ không được để trống" })
    .refine((v) => !isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100, {
      error: "Phí dịch vụ phải từ 0-100%",
    }),
  [SYSTEM_SETTING_KEYS.CURRENCY]: z
    .string()
    .min(1, { error: "Đơn vị tiền tệ không được để trống" }),
  [SYSTEM_SETTING_KEYS.STORE_PHONE]: z.string().optional().default(""),
  [SYSTEM_SETTING_KEYS.STORE_EMAIL]: z
    .string()
    .optional()
    .default("")
    .refine((v) => v === "" || z.email().safeParse(v).success, {
      error: "Email không hợp lệ",
    }),
});

export async function updateSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const keys = [...GENERAL_SYSTEM_SETTING_KEYS];
  const raw: Record<string, unknown> = {};
  for (const key of keys) {
    raw[key] = formData.get(key) ?? "";
  }

  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    SETTINGS_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  // Upsert each setting
  const entries = Object.entries(parsed.data) as [string, string][];
  for (const [key, value] of entries) {
    const { error } = await supabase
      .from("system_settings")
      .upsert(
        { tenant_id: claims.tenant_id, key, value },
        { onConflict: "key,tenant_id" },
      );

    if (error) {
      return {
        success: false,
        error: "Không thể lưu cài đặt. Vui lòng thử lại.",
      };
    }
  }

  revalidateSurfacePath("/admin/settings/general");
  return { success: true };
}
