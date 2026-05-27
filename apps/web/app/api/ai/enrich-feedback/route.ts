/**
 * AI enrichment worker — processes a single feedback row with Claude.
 *
 * Auth: Bearer CRON_SECRET (same secret used by cron routes).
 * Called fire-and-forget from the submit action after successful RPC.
 *
 * Flow:
 *   1. Load feedback. Skip if already processed.
 *   2. Load branch + qr label for prompt context.
 *   3. Call enrichFeedback().
 *   4. UPDATE feedbacks with AI fields.
 *   5. Late escalation: if is_critical_realtime AND outbox row doesn't exist,
 *      insert outbox (catches cases where push_mode='none' but AI deems critical).
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { enrichFeedback } from "@comtammatu/shared/ai";
import {
  checkMonthlyBudget,
  getAppUrl,
  getCronSecret,
} from "@comtammatu/shared/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  feedback_id: z.number().int().positive(),
});

function timingSafeEquals(a: string, b: string): boolean {
  const MAX = 256;
  const ba = Buffer.alloc(MAX);
  const bb = Buffer.alloc(MAX);
  ba.write(a.slice(0, MAX), "utf8");
  bb.write(b.slice(0, MAX), "utf8");
  const eq = timingSafeEqual(ba, bb);
  return eq && a.length === b.length;
}

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "unauthorized" },
    { status: 401 },
  );
}

export async function POST(request: Request) {
  const expected = getCronSecret();
  if (!expected) {
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

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid json" },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid body" },
      { status: 400 },
    );
  }

  const { feedback_id } = parsed.data;
  const supabase = createServiceClient();

  // Load feedback
  const { data: fb } = await supabase
    .from("feedbacks")
    .select(
      "id, tenant_id, branch_id, qr_code_id, rating, comment, ai_processed_at",
    )
    .eq("id", feedback_id)
    .maybeSingle();

  if (!fb) {
    return NextResponse.json(
      { ok: false, error: "feedback_not_found" },
      { status: 404 },
    );
  }

  // Skip if already processed
  if (fb.ai_processed_at !== null) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "already_processed",
    });
  }

  // Load branch name + qr label for context
  const [{ data: branch }, { data: qr }] = await Promise.all([
    supabase
      .from("branches")
      .select("name")
      .eq("id", fb.branch_id)
      .maybeSingle(),
    supabase
      .from("feedback_qr_codes")
      .select("label")
      .eq("id", fb.qr_code_id)
      .maybeSingle(),
  ]);

  // Gate: skip if tenant has exceeded monthly AI budget
  const budgetCheck = await checkMonthlyBudget({
    supabase,
    tenant_id: fb.tenant_id,
  });
  if (!budgetCheck.ok) {
    console.warn(
      "[enrich-feedback] over_budget tenant=%d spent=%.4f budget=%.2f — skipping",
      fb.tenant_id,
      budgetCheck.spent_usd,
      budgetCheck.budget_usd,
    );
    return NextResponse.json({ ok: true, skipped: "over_budget" });
  }

  // Enrich
  const result = await enrichFeedback({
    feedback_id: fb.id,
    rating: fb.rating,
    comment: fb.comment,
    branch_name: branch?.name ?? "Cơm Tấm Má Tư",
    qr_label: qr?.label ?? "",
  });

  const alert_priority = result.is_critical_realtime ? 10 : 0;
  const now = new Date().toISOString();

  // Update feedback with AI fields
  await supabase
    .from("feedbacks")
    .update({
      ai_categories: result.categories,
      ai_severity: result.severity,
      ai_summary_vi: result.summary_vi,
      ai_sentiment_score: result.sentiment_score,
      ai_processed_at: now,
      alert_priority,
    })
    .eq("id", feedback_id);

  // Late escalation: if AI deems critical AND no outbox row yet
  if (result.is_critical_realtime) {
    const { data: existing } = await supabase
      .from("telegram_outbox")
      .select("id")
      .eq("feedback_id", feedback_id)
      .maybeSingle();

    if (!existing) {
      await supabase
        .from("telegram_outbox")
        .insert({ feedback_id, status: "pending", next_retry_at: now })
        .select("id")
        .maybeSingle();

      // Fire telegram flush
      const appUrl = getAppUrl();
      const cronSecret = getCronSecret();
      if (appUrl && cronSecret) {
        void fetch(`${appUrl}/api/cron/telegram-flush`, {
          method: "POST",
          headers: { Authorization: `Bearer ${cronSecret}` },
        }).catch(() => {});
      }
    }
  }

  return NextResponse.json({
    ok: true,
    severity: result.severity,
    is_critical_realtime: result.is_critical_realtime,
    alert_priority,
  });
}
