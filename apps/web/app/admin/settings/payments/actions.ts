"use server";

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { SYSTEM_SETTING_KEYS } from "@comtammatu/shared/settings";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";

const SETTINGS_ROLES: readonly StaffRole[] = ["owner", "super_manager"];

const paymentSettingsSchema = z.object({
  [SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR]: z.enum(["true", "false"]),
  [SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_MOMO]: z.enum(["true", "false"]),
});

export async function updatePaymentSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const raw = {
    [SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR]:
      formData.get(SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR) === "true"
        ? "true"
        : "false",
    [SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_MOMO]:
      formData.get(SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_MOMO) === "true"
        ? "true"
        : "false",
  };

  const parsed = paymentSettingsSchema.safeParse(raw);
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

  revalidateSurfacePath("/admin/settings/payments");
  return { success: true };
}
