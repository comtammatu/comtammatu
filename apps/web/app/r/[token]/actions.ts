"use server";

import { headers } from "next/headers";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import {
  submitFeedbackSchema,
  hashIp,
  getAllowedOriginsFeedback,
  getIpHashSalt,
  getAppUrl,
  getCronSecret,
  type SubmitFeedbackInput,
} from "@comtammatu/shared/feedback";
import {
  feedbackTokenRateLimit,
  feedbackIpRateLimit,
} from "@comtammatu/security";
import type { ActionResult } from "@comtammatu/shared/types";

export async function submitFeedback(
  input: SubmitFeedbackInput,
  meta: { token: string },
): Promise<ActionResult<{ feedback_id: number }>> {
  // 1. Validate input
  const parsed = submitFeedbackSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Dữ liệu không hợp lệ",
      errorCode: "validation_failed",
    };
  }

  // 2. Honeypot check — return fake success, do NOT insert
  if (parsed.data.website !== "") {
    return { success: true, data: { feedback_id: 0 } };
  }

  // 3. Origin check — fail-closed in production if env unset (compliance gate)
  const headersList = await headers();
  const origin = headersList.get("origin") ?? "";
  const allowedOrigins = getAllowedOriginsFeedback();
  if (allowedOrigins.length === 0) {
    if (process.env.NODE_ENV === "production") {
      return { success: false, error: "Forbidden", errorCode: "forbidden" };
    }
  } else if (!allowedOrigins.includes(origin)) {
    return { success: false, error: "Forbidden", errorCode: "forbidden" };
  }

  // 4. Hash IP
  const xForwardedFor = headersList.get("x-forwarded-for") ?? "";
  const rawIp = xForwardedFor.split(",")[0]?.trim() ?? "unknown";
  const salt = getIpHashSalt();
  let ipHash: string | null = null;
  try {
    ipHash = await hashIp(rawIp, salt);
  } catch {
    // Non-fatal — proceed without ip_hash
  }

  // 5. Rate limit
  const [tokenLimit, ipLimit] = await Promise.all([
    feedbackTokenRateLimit.limit(meta.token),
    feedbackIpRateLimit.limit(ipHash ?? rawIp),
  ]);
  if (!tokenLimit.success || !ipLimit.success) {
    return {
      success: false,
      error: "Bạn đã gửi nhiều phản ánh, vui lòng thử lại sau.",
      errorCode: "rate_limited",
    };
  }

  // 6. User agent (truncated)
  const userAgentShort =
    (headersList.get("user-agent") ?? "").slice(0, 200) || null;

  // 7. Submit via RPC
  const supabase = createServiceClient();
  const { data: feedbackId, error } = await supabase.rpc("submit_feedback", {
    p_token: meta.token,
    p_rating: parsed.data.rating,
    p_comment: parsed.data.comment,
    p_phone: parsed.data.phone ?? undefined,
    p_photo_paths: [],
    p_ip_hash: ipHash ?? undefined,
    p_user_agent_short: userAgentShort ?? undefined,
  });

  if (error) {
    // P0002 = token_not_found_or_inactive (raise_exception in Postgres)
    if (error.code === "P0002") {
      return {
        success: false,
        error: "QR không hợp lệ hoặc đã bị vô hiệu hóa.",
        errorCode: "token_invalid",
      };
    }
    console.error("[submitFeedback] rpc error code=%s", error.code);
    return {
      success: false,
      error: "Có lỗi xảy ra, vui lòng thử lại.",
      errorCode: "internal",
    };
  }

  // 8. Fire-and-forget Telegram flush for low-rating submissions
  const appUrl = getAppUrl();
  const cronSecret = getCronSecret();

  if (parsed.data.rating <= 3 && appUrl && cronSecret) {
    void fetch(`${appUrl}/api/cron/telegram-flush`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    }).catch(() => {});
  }

  // 9. Fire-and-forget AI enrichment
  if (appUrl && cronSecret && feedbackId) {
    void fetch(`${appUrl}/api/ai/enrich-feedback`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ feedback_id: feedbackId as number }),
    }).catch(() => {});
  }

  return { success: true, data: { feedback_id: feedbackId as number } };
}
