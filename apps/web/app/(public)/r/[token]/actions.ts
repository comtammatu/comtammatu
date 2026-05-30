"use server";

import { after } from "next/server";
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

type SubmitFeedbackRpcResult = {
  feedback_id: number;
  photo_upload_token: string;
  photo_upload_expires_at: string;
};

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const numeric = Number(value);
    return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
  }
  return null;
}

function parseSubmitFeedbackRpcResult(
  value: unknown,
): SubmitFeedbackRpcResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const feedbackId = parsePositiveInteger(record.feedback_id);
  if (!feedbackId) {
    return null;
  }

  if (
    typeof record.photo_upload_token !== "string" ||
    !/^[a-f0-9]{64}$/.test(record.photo_upload_token)
  ) {
    return null;
  }

  if (typeof record.photo_upload_expires_at !== "string") {
    return null;
  }

  return {
    feedback_id: feedbackId,
    photo_upload_token: record.photo_upload_token,
    photo_upload_expires_at: record.photo_upload_expires_at,
  };
}

// One-shot warn on first prod request seen with the allowlist unset; after
// the first hit we silence to avoid log noise (worker stays warm for the
// rest of its lifetime).
let warnedMissingOriginsEnv = false;

export async function submitFeedback(
  input: SubmitFeedbackInput,
  meta: { token: string },
): Promise<
  ActionResult<{ feedback_id: number; photo_upload_token: string | null }>
> {
  const parsed = submitFeedbackSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Dữ liệu không hợp lệ",
      errorCode: "validation_failed",
    };
  }

  // Honeypot check — return fake success, do NOT insert
  if (parsed.data.website !== "") {
    console.info(
      "[submitFeedback] honeypot tripped token=%s",
      meta.token.slice(0, 8),
    );
    return { success: true, data: { feedback_id: 0, photo_upload_token: null } };
  }

  // Origin check — layered CSRF defense.
  //   Layer 1 (here): server-side allowlist via ALLOWED_ORIGINS_FEEDBACK env.
  //   Layer 2: Server Actions ship a fresh CSRF token on every request that
  //            Next.js validates before the action body runs.
  //   Layer 3: SameSite=Lax cookies on the auth session.
  // Fail-closed in production when the allowlist env is missing/empty so a
  // mis-deploy can't silently disable Layer 1.
  const headersList = await headers();
  const origin = headersList.get("origin") ?? "";
  const allowedOrigins = getAllowedOriginsFeedback();
  if (allowedOrigins.length === 0) {
    if (process.env.NODE_ENV === "production") {
      if (!warnedMissingOriginsEnv) {
        warnedMissingOriginsEnv = true;
        console.warn(
          "[submitFeedback] ALLOWED_ORIGINS_FEEDBACK unset in production — failing closed",
        );
      }
      return { success: false, error: "Forbidden", errorCode: "forbidden" };
    }
  } else if (!allowedOrigins.includes(origin)) {
    return { success: false, error: "Forbidden", errorCode: "forbidden" };
  }

  const xForwardedFor = headersList.get("x-forwarded-for") ?? "";
  const rawIp = xForwardedFor.split(",")[0]?.trim() ?? "unknown";
  const salt = getIpHashSalt();
  let ipHash: string | null = null;
  try {
    ipHash = await hashIp(rawIp, salt);
  } catch {
    // Non-fatal — proceed without ip_hash
  }

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

  const userAgentShort =
    (headersList.get("user-agent") ?? "").slice(0, 200) || null;

  const supabase = createServiceClient();
  const { data: rpcData, error } = await supabase.rpc("submit_feedback", {
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

  const rpcResult = parseSubmitFeedbackRpcResult(rpcData);
  if (!rpcResult) {
    console.error("[submitFeedback] unexpected rpc result shape");
    return {
      success: false,
      error: "Có lỗi xảy ra, vui lòng thử lại.",
      errorCode: "internal",
    };
  }

  const feedbackId = rpcResult.feedback_id;

  // Post-response side effects via after() — guarantees execution after the
  // response has been sent. Fire-and-forget `void fetch()` was vulnerable to
  // the serverless runtime tearing down before the request completed.
  const appUrl = getAppUrl();
  const cronSecret = getCronSecret();

  if (appUrl && cronSecret) {
    after(async () => {
      if (parsed.data.rating <= 3) {
        await fetch(`${appUrl}/api/cron/telegram-flush`, {
          method: "POST",
          headers: { Authorization: `Bearer ${cronSecret}` },
        }).catch((err: unknown) => {
          console.warn(
            "[submitFeedback.after] telegram-flush failed: %s",
            err instanceof Error ? err.message : String(err),
          );
        });
      }
      if (feedbackId) {
        await fetch(`${appUrl}/api/ai/enrich-feedback`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cronSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ feedback_id: feedbackId }),
        }).catch((err: unknown) => {
          console.warn(
            "[submitFeedback.after] ai-enrich failed: %s",
            err instanceof Error ? err.message : String(err),
          );
        });
      }
    });
  }

  return {
    success: true,
    data: {
      feedback_id: feedbackId,
      photo_upload_token: rpcResult.photo_upload_token,
    },
  };
}
