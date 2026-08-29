"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  PERMISSION_KEYS,
  STAFF_ROLES,
} from "@comtammatu/shared/auth";
import {
  DEFAULT_WASTE_TIER_SETTINGS,
  SYSTEM_SETTING_KEYS,
} from "@comtammatu/shared/settings";
import { getAuthContextWithPermission } from "@/(protected)/inventory/_lib/auth";

export const wasteTierFormSchema = z
  .object({
    tierEnabled: z.boolean().default(DEFAULT_WASTE_TIER_SETTINGS.tierEnabled),
    tier1Threshold: z.coerce
      .number()
      .int()
      .min(0, "Ngưỡng cần ảnh không được âm")
      .max(1_000_000_000, "Ngưỡng cần ảnh tối đa 1 tỷ")
      .default(DEFAULT_WASTE_TIER_SETTINGS.tier1Threshold),
    tier2Threshold: z.coerce
      .number()
      .int()
      .min(0, "Ngưỡng cần duyệt không được âm")
      .max(1_000_000_000, "Ngưỡng cần duyệt tối đa 1 tỷ")
      .default(DEFAULT_WASTE_TIER_SETTINGS.tier2Threshold),
    shiftCap: z.coerce
      .number()
      .int()
      .min(0, "Trần ca không được âm")
      .max(1_000_000_000, "Trần ca tối đa 1 tỷ")
      .default(DEFAULT_WASTE_TIER_SETTINGS.shiftCap),
    qtyRatioThreshold: z.coerce
      .number()
      .min(0, "Tỷ lệ không được âm")
      .max(1, "Tỷ lệ tối đa là 1 (100%)")
      .default(DEFAULT_WASTE_TIER_SETTINGS.qtyRatioThreshold),
    enforceReasonRules: z
      .boolean()
      .default(DEFAULT_WASTE_TIER_SETTINGS.enforceReasonRules),
  })
  .refine((data) => data.tier2Threshold >= data.tier1Threshold, {
    message:
      "Ngưỡng cần duyệt phải lớn hơn hoặc bằng ngưỡng cần ảnh",
    path: ["tier2Threshold"],
  });

export type WasteTierFormValues = z.infer<typeof wasteTierFormSchema>;

export async function saveWasteTierSettings(
  input: unknown,
): Promise<{ success: boolean; error?: string }> {
  const parsed = wasteTierFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu cấu hình không hợp lệ.",
    };
  }

  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) {
    return {
      success: false,
      error: "Bạn không có quyền chỉnh sửa cấu hình hao hụt toàn chuỗi.",
    };
  }

  const { supabase, claims } = ctx;
  const values = parsed.data;

  const rows: { tenant_id: number; key: string; value: string }[] = [
    {
      tenant_id: claims.tenant_id,
      key: SYSTEM_SETTING_KEYS.INVENTORY_WASTE_TIER_ENABLED,
      value: String(values.tierEnabled),
    },
    {
      tenant_id: claims.tenant_id,
      key: SYSTEM_SETTING_KEYS.INVENTORY_WASTE_TIER1_THRESHOLD,
      value: String(values.tier1Threshold),
    },
    {
      tenant_id: claims.tenant_id,
      key: SYSTEM_SETTING_KEYS.INVENTORY_WASTE_TIER2_THRESHOLD,
      value: String(values.tier2Threshold),
    },
    {
      tenant_id: claims.tenant_id,
      key: SYSTEM_SETTING_KEYS.INVENTORY_WASTE_SHIFT_CAP,
      value: String(values.shiftCap),
    },
    {
      tenant_id: claims.tenant_id,
      key: SYSTEM_SETTING_KEYS.INVENTORY_WASTE_QTY_RATIO_THRESHOLD,
      value: String(values.qtyRatioThreshold),
    },
    {
      tenant_id: claims.tenant_id,
      key: SYSTEM_SETTING_KEYS.INVENTORY_WASTE_ENFORCE_REASON_RULES,
      value: String(values.enforceReasonRules),
    },
  ];

  const results = await Promise.all(
    rows.map((row) =>
      supabase
        .from("system_settings")
        .upsert(row, { onConflict: "key,tenant_id" }),
    ),
  );

  if (results.some((r) => r.error)) {
    return {
      success: false,
      error: "Không thể lưu cài đặt hao hụt. Vui lòng thử lại.",
    };
  }

  revalidatePath("/inventory/settings/waste");
  revalidatePath("/inventory/waste");
  revalidatePath("/inventory/consumption");
  return { success: true };
}
