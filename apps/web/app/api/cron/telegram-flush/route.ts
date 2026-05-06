/**
 * Telegram outbox flusher — drains feedback alert queue.
 *
 * Auth: shared bearer token via `CRON_SECRET` env. Vercel Cron sends this
 * header automatically. Public callers without the secret get 401 — without
 * this, anyone could trigger flush at will (DoS on Telegram + replay storm).
 *
 * Schedule: every 1 minute via vercel.json. P95 delivery ≤ 90s
 * (60s cron tick + 30s send buffer).
 *
 * Per-feedback flow:
 *   1. Pick up to BATCH_SIZE outbox rows where status IN ('pending','failed')
 *      AND next_retry_at <= NOW().
 *   2. For each, load feedback + QR label + applicable destinations
 *      (matching branch + HQ-level).
 *   3. Send Telegram message to each active destination.
 *   4. Update outbox state machine:
 *        - any success → status='sent', sent_at, mark feedback.alert_sent_telegram_at
 *        - all failed  → attempts++, last_error, status='dead' once attempts >= MAX,
 *                        otherwise 'failed' with next_retry_at = NOW + backoff[attempts]
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import {
  sendTelegramMessage,
  formatFeedbackTelegramMessage,
  redactTelegramToken,
} from "@comtammatu/shared/telegram";
import {
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_BACKOFF_MINUTES,
  getCronSecret,
  getTelegramBotToken,
  getAppUrl,
} from "@comtammatu/shared/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH_SIZE = 50;

/**
 * Constant-time string compare. Pads to a fixed buffer length so the
 * compare runs in O(MAX) regardless of input — no length-leak via timing.
 * Falls back gracefully via Buffer underlying memcmp.
 */
function timingSafeEquals(a: string, b: string): boolean {
  const MAX = 256;
  const ba = Buffer.alloc(MAX);
  const bb = Buffer.alloc(MAX);
  ba.write(a.slice(0, MAX), "utf8");
  bb.write(b.slice(0, MAX), "utf8");
  // Length mismatch (after truncation) implies inequality but we still
  // run the compare to avoid early exit on length.
  const eq = timingSafeEqual(ba, bb);
  return eq && a.length === b.length;
}

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "unauthorized" },
    { status: 401 },
  );
}

function backoffMinutes(attempts: number): number {
  // attempts is the count BEFORE this send. After incrementing, look up
  // backoff for the new count. Index clamped to last entry on overflow.
  const idx = Math.min(attempts, OUTBOX_BACKOFF_MINUTES.length - 1);
  return OUTBOX_BACKOFF_MINUTES[idx] ?? 16;
}

export async function POST(request: Request) {
  const expected = getCronSecret();
  if (!expected) {
    console.error("[cron/telegram-flush] CRON_SECRET not configured");
    return NextResponse.json(
      { ok: false, error: "not configured" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  const provided = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  if (!provided || !timingSafeEquals(provided, expected)) {
    return unauthorized();
  }

  const botToken = getTelegramBotToken();
  if (!botToken) {
    console.error("[cron/telegram-flush] TELEGRAM_BOT_TOKEN not configured");
    return NextResponse.json(
      { ok: false, error: "telegram not configured" },
      { status: 503 },
    );
  }

  const appUrl = getAppUrl();
  const supabase = createServiceClient();
  const counters = { picked: 0, sent: 0, failed: 0, dead: 0 };

  // Pick batch of work
  const { data: outboxRows, error: pickErr } = await supabase
    .from("telegram_outbox")
    .select("id, feedback_id, attempts, status")
    .in("status", ["pending", "failed"])
    .lte("next_retry_at", new Date().toISOString())
    .order("next_retry_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (pickErr) {
    console.error("[cron/telegram-flush] pick failed code=%s", pickErr.code);
    return NextResponse.json({ ok: false, error: "pick failed" }, { status: 500 });
  }

  counters.picked = outboxRows?.length ?? 0;

  for (const row of outboxRows ?? []) {
    // Load feedback (tenant_id needed for cross-tenant defense filter on destinations)
    const { data: fb } = await supabase
      .from("feedbacks")
      .select("id, tenant_id, rating, comment, branch_id, qr_code_id, phone, created_at")
      .eq("id", row.feedback_id)
      .maybeSingle();

    if (!fb) {
      // Feedback gone — mark outbox dead so it doesn't retry forever.
      await supabase
        .from("telegram_outbox")
        .update({
          status: "dead",
          last_error: "feedback_not_found",
          attempts: row.attempts + 1,
        })
        .eq("id", row.id);
      counters.dead += 1;
      continue;
    }

    // Load QR label + branch name (separate queries — see admin pages comment)
    const { data: qr } = await supabase
      .from("feedback_qr_codes")
      .select("label")
      .eq("id", fb.qr_code_id)
      .maybeSingle();

    const { data: branch } = await supabase
      .from("branches")
      .select("name")
      .eq("id", fb.branch_id)
      .maybeSingle();

    // Find applicable destinations: branch-specific OR HQ-level (NULL)
    // tenant_id filter = defense-in-depth (service_role bypasses RLS).
    const { data: dests } = await supabase
      .from("telegram_destinations")
      .select("id, chat_id, consecutive_failures")
      .eq("tenant_id", fb.tenant_id)
      .or(`branch_id.eq.${fb.branch_id},branch_id.is.null`)
      .eq("is_active", true);

    if (!dests || dests.length === 0) {
      // No destinations configured — mark dead (owner needs to set up settings).
      await supabase
        .from("telegram_outbox")
        .update({
          status: "dead",
          last_error: "no_active_destinations",
          attempts: row.attempts + 1,
        })
        .eq("id", row.id);
      counters.dead += 1;
      continue;
    }

    const messageText = formatFeedbackTelegramMessage({
      feedback_id: fb.id,
      rating: fb.rating,
      comment: fb.comment,
      branch_name: branch?.name ?? "Cơm Tấm Má Tư",
      qr_label: qr?.label ?? "",
      has_phone: fb.phone !== null,
      admin_url: `${appUrl}/admin/feedback?id=${fb.id}`,
      created_at: fb.created_at,
    });

    let sendOk = false;
    let lastErr: string | null = null;
    const CIRCUIT_BREAKER_THRESHOLD = 10;
    for (const dest of dests) {
      const result = await sendTelegramMessage({
        botToken,
        chatId: dest.chat_id,
        text: messageText,
      });
      if (result.ok) {
        sendOk = true;
        // Reset failure counter on success
        if (dest.consecutive_failures > 0) {
          await supabase
            .from("telegram_destinations")
            .update({ consecutive_failures: 0 })
            .eq("id", dest.id);
        }
      } else {
        lastErr = redactTelegramToken(
          `dest=${dest.id} status=${result.status} ${result.description}`,
          botToken,
        );
        const newFailures = dest.consecutive_failures + 1;
        const willDeactivate = newFailures >= CIRCUIT_BREAKER_THRESHOLD;
        await supabase
          .from("telegram_destinations")
          .update({
            consecutive_failures: newFailures,
            ...(willDeactivate ? { is_active: false } : {}),
          })
          .eq("id", dest.id);
        if (willDeactivate) {
          console.warn(
            "[cron/telegram-flush] dest=%d deactivated after %d consecutive failures",
            dest.id,
            newFailures,
          );
        }
      }
    }

    if (sendOk) {
      const nowIso = new Date().toISOString();
      await supabase
        .from("telegram_outbox")
        .update({
          status: "sent",
          sent_at: nowIso,
          attempts: row.attempts + 1,
          last_error: null,
        })
        .eq("id", row.id);
      await supabase
        .from("feedbacks")
        .update({ alert_sent_telegram_at: nowIso })
        .eq("id", fb.id);
      counters.sent += 1;
    } else {
      const nextAttempts = row.attempts + 1;
      const willDie = nextAttempts >= OUTBOX_MAX_ATTEMPTS;
      const retryMin = backoffMinutes(nextAttempts);
      const nextRetry = new Date(Date.now() + retryMin * 60_000).toISOString();
      await supabase
        .from("telegram_outbox")
        .update({
          status: willDie ? "dead" : "failed",
          attempts: nextAttempts,
          last_error: lastErr,
          next_retry_at: nextRetry,
        })
        .eq("id", row.id);
      if (willDie) counters.dead += 1;
      else counters.failed += 1;
    }
  }

  return NextResponse.json({ ok: true, ...counters });
}

// GET handler for Vercel Cron (which uses GET by default)
export const GET = POST;
