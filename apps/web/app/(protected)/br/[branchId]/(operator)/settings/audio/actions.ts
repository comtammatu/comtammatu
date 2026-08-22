"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import {
  ALLOWED_TTS_MODELS,
  SYSTEM_SETTING_KEYS,
} from "@comtammatu/shared/settings";
import { getAuthContextWithAnyPermission } from "@/_lib/auth";

const branchAudioSchema = z.object({
  branchId: z.number().int().positive(),
  inherit: z.boolean(),
  model: z.enum(ALLOWED_TTS_MODELS).optional(),
  voice: z.string().trim().max(100).optional(),
});

export async function updateBranchAudioSettings(
  input: unknown,
): Promise<{ success: boolean; error?: string }> {
  const parsed = branchAudioSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu cấu hình không hợp lệ." };
  }

  const { branchId, inherit, model, voice } = parsed.data;

  const ctx = await getAuthContextWithAnyPermission(
    MODULE_ACL.branch_settings.allowedRoles,
    [PERMISSION_KEYS.SETTINGS_BRANCH, PERMISSION_KEYS.SETTINGS_TENANT],
  );
  if (!ctx) {
    return {
      success: false,
      error: "Không có quyền thay đổi cài đặt chi nhánh.",
    };
  }

  const { supabase, claims } = ctx;

  if (inherit) {
    const { error } = await supabase
      .from("branch_settings")
      .delete()
      .eq("branch_id", branchId)
      .in("key", [
        SYSTEM_SETTING_KEYS.TTS_MODEL,
        SYSTEM_SETTING_KEYS.TTS_VOICE,
      ]);

    if (error) {
      return {
        success: false,
        error: "Không thể xóa tùy chỉnh chi nhánh. Vui lòng thử lại.",
      };
    }
  } else {
    const targetModel = model ?? "openai/tts-1";
    const targetVoice = voice ?? "";

    const rows: {
      tenant_id: number;
      branch_id: number;
      key: string;
      value: string;
    }[] = [
      {
        tenant_id: claims.tenant_id,
        branch_id: branchId,
        key: SYSTEM_SETTING_KEYS.TTS_MODEL,
        value: targetModel,
      },
      {
        tenant_id: claims.tenant_id,
        branch_id: branchId,
        key: SYSTEM_SETTING_KEYS.TTS_VOICE,
        value: targetVoice,
      },
    ];

    const { error } = await supabase
      .from("branch_settings")
      .upsert(rows, { onConflict: "branch_id,key" });

    if (error) {
      return {
        success: false,
        error: "Không thể lưu cài đặt chi nhánh. Vui lòng thử lại.",
      };
    }
  }

  revalidatePath(`/br/${branchId}/settings/audio`);
  return { success: true };
}
