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
  [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE]: z
    .string()
    .trim()
    .max(32)
    .regex(/^[A-Za-z0-9]*$/, {
      error: "Mã ngân hàng chỉ chứa chữ và số (vd: TCB, VCB, 970407).",
    }),
  [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO]: z
    .string()
    .trim()
    .max(32)
    .regex(/^[A-Za-z0-9]*$/, {
      error: "Số tài khoản chỉ chứa chữ và số (không khoảng trắng).",
    }),
  [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME]: z.string().trim().max(64),
});

export async function updatePaymentSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const str = (k: string) => (formData.get(k) ?? "").toString();
  const raw = {
    [SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR]:
      formData.get(SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR) === "true"
        ? "true"
        : "false",
    [SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_MOMO]:
      formData.get(SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_MOMO) === "true"
        ? "true"
        : "false",
    [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE]: str(
      SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE,
    ).toUpperCase(),
    [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO]: str(
      SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO,
    ),
    [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME]: str(
      SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME,
    ).toUpperCase(),
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
