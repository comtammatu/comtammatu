"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  TENANT_STRATEGY_SETTINGS_ROLES,
  PERMISSION_KEYS,
} from "@comtammatu/shared/auth";
import {
  ALLOWED_TTS_MODELS,
  SYSTEM_SETTING_KEYS,
} from "@comtammatu/shared/settings";
import { getAuthContextWithPermission } from "@/_lib/auth";

const tenantAudioSchema = z.object({
  model: z.enum(ALLOWED_TTS_MODELS),
  voice: z.string().trim().max(100),
});

export async function updateTenantAudioSettings(
  input: unknown,
): Promise<{ success: boolean; error?: string }> {
  const parsed = tenantAudioSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu cấu hình không hợp lệ." };
  }

  const { model, voice } = parsed.data;

  const ctx = await getAuthContextWithPermission(
    TENANT_STRATEGY_SETTINGS_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) {
    return {
      success: false,
      error: "Không có quyền thay đổi cài đặt toàn chuỗi.",
    };
  }

  const { supabase, claims } = ctx;

  const rows: { tenant_id: number; key: string; value: string }[] = [
    {
      tenant_id: claims.tenant_id,
      key: SYSTEM_SETTING_KEYS.TTS_MODEL,
      value: model,
    },
    {
      tenant_id: claims.tenant_id,
      key: SYSTEM_SETTING_KEYS.TTS_VOICE,
      value: voice,
    },
  ];

  const results = await Promise.all(
    rows.map((row) =>
      supabase
        .from("system_settings")
        .upsert(row, { onConflict: "key,tenant_id" }),
    ),
  );

  if (results.some((result) => result.error)) {
    return {
      success: false,
      error: "Không thể lưu cài đặt âm thanh. Vui lòng thử lại.",
    };
  }

  revalidatePath("/settings/audio");
  return { success: true };
}
