"use server";

import { z } from "zod";
import {
  createTelegramDestinationSchema,
  toggleTelegramDestinationSchema,
  updateFeedbackSettingsSchema,
  getTelegramBotToken,
} from "@comtammatu/shared/feedback";
import { sendTelegramMessage } from "@comtammatu/shared/telegram";
import { getAuthContext } from "@/_lib/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import type {
  FeedbackSettingsRow,
  UpdateFeedbackSettingsInput,
} from "@comtammatu/shared/feedback";

const OWNER_ONLY: readonly ["owner"] = ["owner"];

const destIdSchema = z.number().int().positive();

export async function createTelegramDestination(
  input: unknown,
): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext(OWNER_ONLY);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const parsed = createTelegramDestinationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { branch_id, chat_id, label } = parsed.data;
  const { supabase, claims } = ctx;

  const { data: created, error } = await supabase
    .from("telegram_destinations")
    .insert({
      tenant_id: claims.tenant_id,
      branch_id: branch_id ?? null,
      chat_id,
      label,
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("[createTelegramDestination] insert error", error?.code);
    return { success: false, error: "Không thể tạo destination." };
  }

  return { success: true, data: { id: created.id } };
}

export async function toggleTelegramDestination(
  input: unknown,
): Promise<ActionResult> {
  const ctx = await getAuthContext(OWNER_ONLY);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const parsed = toggleTelegramDestinationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { id, is_active } = parsed.data;
  const { supabase, claims } = ctx;

  const { error } = await supabase
    .from("telegram_destinations")
    .update({ is_active })
    .eq("id", id)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return { success: false, error: "Không thể cập nhật trạng thái." };
  }

  return { success: true };
}

export async function deleteTelegramDestination(
  id: number,
): Promise<ActionResult> {
  const ctx = await getAuthContext(OWNER_ONLY);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const parsedId = destIdSchema.safeParse(id);
  if (!parsedId.success) return { success: false, error: "ID không hợp lệ" };

  const { supabase, claims } = ctx;

  const { error } = await supabase
    .from("telegram_destinations")
    .delete()
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return { success: false, error: "Không thể xoá destination." };
  }

  return { success: true };
}

export async function sendTestTelegram(
  destinationId: number,
): Promise<ActionResult> {
  const ctx = await getAuthContext(OWNER_ONLY);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const parsedId = destIdSchema.safeParse(destinationId);
  if (!parsedId.success) return { success: false, error: "ID không hợp lệ" };

  const { supabase, claims } = ctx;

  const { data: dest } = await supabase
    .from("telegram_destinations")
    .select("chat_id")
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!dest) {
    return { success: false, error: "Destination không tồn tại." };
  }

  const botToken = getTelegramBotToken();
  if (!botToken) {
    return { success: false, error: "TELEGRAM_BOT_TOKEN chưa được cấu hình." };
  }

  const testText =
    "✅ *Test message từ Cơm Tấm Má Tư* \\- kết nối thành công\\!";
  const result = await sendTelegramMessage({
    botToken,
    chatId: dest.chat_id,
    text: testText,
  });

  if (!result.ok) {
    console.error("[sendTestTelegram] failed status=%d", result.status);
    return {
      success: false,
      error: "Gửi tin nhắn test thất bại. Kiểm tra chat_id.",
    };
  }

  return { success: true };
}

export async function getFeedbackSettings(): Promise<
  ActionResult<FeedbackSettingsRow>
> {
  const ctx = await getAuthContext(OWNER_ONLY);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data } = await supabase
    .from("feedback_settings")
    .select(
      "tenant_id, ai_monthly_budget_usd, push_mode, threshold_rating, daily_report_hour_local, updated_at, updated_by",
    )
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!data) {
    const defaults: FeedbackSettingsRow = {
      tenant_id: claims.tenant_id,
      ai_monthly_budget_usd: 5,
      push_mode: "threshold",
      threshold_rating: 3,
      daily_report_hour_local: 8,
      updated_at: new Date().toISOString(),
      updated_by: null,
    };
    return { success: true, data: defaults };
  }

  return { success: true, data: data as FeedbackSettingsRow };
}

export async function updateFeedbackSettings(
  input: unknown,
): Promise<ActionResult> {
  const ctx = await getAuthContext(OWNER_ONLY);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const parsed = updateFeedbackSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { supabase, claims } = ctx;
  const update: UpdateFeedbackSettingsInput = parsed.data;

  const { error } = await supabase.from("feedback_settings").upsert(
    {
      tenant_id: claims.tenant_id,
      ...update,
    },
    { onConflict: "tenant_id" },
  );

  if (error) {
    console.error("[updateFeedbackSettings] upsert error", error.code);
    return { success: false, error: "Không thể lưu cài đặt." };
  }

  return { success: true };
}
