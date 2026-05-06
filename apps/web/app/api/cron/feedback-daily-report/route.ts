/**
 * Daily feedback report cron worker.
 *
 * Auth: Bearer CRON_SECRET.
 * Schedule: 0 19 * * * (UTC) = 02:00 ICT — add to vercel.json.
 *
 * For each tenant → each branch + 1 tenant-wide rollup:
 *   1. Compute report_date = yesterday in Asia/Ho_Chi_Minh.
 *   2. Skip if report already exists (UNIQUE constraint).
 *   3. SELECT feedbacks for that scope + date.
 *   4. Skip if feedback_count = 0.
 *   5. generateDailyReport().
 *   6. INSERT feedback_daily_reports.
 *   7. Send Telegram summary to applicable destinations.
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { generateDailyReport } from "@comtammatu/shared/ai";
import {
  checkMonthlyBudget,
  type FeedbackCategory,
} from "@comtammatu/shared/feedback";
import type { AiSeverity } from "@comtammatu/shared/ai";
import {
  sendTelegramMessage,
  redactTelegramToken,
} from "@comtammatu/shared/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vietnam timezone offset is UTC+7
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function getYesterdayInVietnam(): string {
  const nowUtc = Date.now();
  const nowVn = new Date(nowUtc + VN_OFFSET_MS);
  const yesterday = new Date(nowVn.getTime() - 24 * 60 * 60 * 1000);
  const y = yesterday.getUTCFullYear();
  const m = String(yesterday.getUTCMonth() + 1).padStart(2, "0");
  const d = String(yesterday.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toVnDateStart(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00+07:00`).toISOString();
}

function toVnDateEnd(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59.999+07:00`).toISOString();
}

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
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  const provided = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  if (!provided || !timingSafeEquals(provided, expected)) {
    return unauthorized();
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const supabase = createServiceClient();

  const reportDate = getYesterdayInVietnam();
  const dateStart = toVnDateStart(reportDate);
  const dateEnd = toVnDateEnd(reportDate);

  const counters = {
    tenants_processed: 0,
    reports_generated: 0,
    reports_skipped_exists: 0,
    reports_skipped_empty: 0,
    over_budget: 0,
    errors: 0,
  };

  // Get all tenants (no is_active column — tenants table uses soft delete via RLS)
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id");

  if (!tenants || tenants.length === 0) {
    return NextResponse.json({ ok: true, ...counters });
  }

  for (const tenant of tenants) {
    counters.tenants_processed += 1;
    const tenantId = tenant.id;

    // Gate: skip entire tenant if monthly AI budget exhausted
    const budgetCheck = await checkMonthlyBudget({ supabase, tenant_id: tenantId });
    if (!budgetCheck.ok) {
      console.warn(
        "[cron/feedback-daily-report] over_budget tenant=%d spent=%.4f budget=%.2f — skipping",
        tenantId,
        budgetCheck.spent_usd,
        budgetCheck.budget_usd,
      );
      counters.over_budget += 1;
      continue;
    }

    // Get branches for this tenant
    const { data: branches } = await supabase
      .from("branches")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("is_active", true);

    // Build list: each branch + null (tenant rollup)
    const scopes: Array<{ branch_id: number | null; branch_name: string | null }> = [
      ...(branches ?? []).map((b) => ({
        branch_id: b.id as number,
        branch_name: b.name as string,
      })),
      { branch_id: null, branch_name: null }, // tenant-wide rollup
    ];

    for (const scope of scopes) {
      try {
        // Check if report already exists
        const { data: existing } = await supabase
          .from("feedback_daily_reports")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("report_date", reportDate)
          .filter(
            "branch_id",
            scope.branch_id !== null ? "eq" : "is",
            scope.branch_id !== null ? String(scope.branch_id) : null,
          )
          .maybeSingle();

        if (existing) {
          counters.reports_skipped_exists += 1;
          continue;
        }

        // SELECT feedbacks for the scope + date range
        let query = supabase
          .from("feedbacks")
          .select(
            "rating, comment, ai_categories, ai_severity, created_at",
          )
          .eq("tenant_id", tenantId)
          .gte("created_at", dateStart)
          .lte("created_at", dateEnd);

        if (scope.branch_id !== null) {
          query = query.eq("branch_id", scope.branch_id);
        }

        const { data: feedbacks } = await query;

        if (!feedbacks || feedbacks.length === 0) {
          counters.reports_skipped_empty += 1;
          continue;
        }

        const reportResult = await generateDailyReport({
          branch_name: scope.branch_name,
          report_date: reportDate,
          feedbacks: feedbacks.map((f) => ({
            rating: f.rating,
            comment: f.comment,
            ai_categories: (f.ai_categories ?? null) as
              | FeedbackCategory[]
              | null,
            ai_severity: (f.ai_severity ?? null) as AiSeverity | null,
            created_at: f.created_at,
          })),
        });

        const { error: insertErr } = await supabase
          .from("feedback_daily_reports")
          .insert({
            tenant_id: tenantId,
            branch_id: scope.branch_id,
            report_date: reportDate,
            feedback_count: reportResult.feedback_count,
            avg_rating: reportResult.avg_rating,
            report_md: reportResult.report_md,
            metrics_json: reportResult.metrics_json as never,
            llm_model: reportResult.llm_model,
            llm_cost_usd: reportResult.llm_cost_usd,
          });

        if (insertErr) {
          // Duplicate key = already generated by concurrent run — not an error
          if (insertErr.code !== "23505") {
            console.error(
              "[cron/feedback-daily-report] insert error tenant=%d branch=%s code=%s",
              tenantId,
              scope.branch_id,
              insertErr.code,
            );
            counters.errors += 1;
          }
          continue;
        }

        counters.reports_generated += 1;

        // Send Telegram summary if bot configured
        if (botToken) {
          const scopeLabel = scope.branch_name ?? "Toàn hệ thống";
          const avgLabel =
            reportResult.avg_rating !== null
              ? reportResult.avg_rating.toFixed(2)
              : "N/A";
          const summaryMsg =
            `📊 *Báo cáo ngày ${reportDate}* — ${scopeLabel}\n` +
            `Tổng phản hồi: ${reportResult.feedback_count} | Điểm TB: ${avgLabel}/5\n\n` +
            reportResult.report_md.slice(0, 1000);

          // Find applicable destinations
          let destQuery = supabase
            .from("telegram_destinations")
            .select("chat_id")
            .eq("tenant_id", tenantId)
            .eq("is_active", true);

          if (scope.branch_id !== null) {
            destQuery = destQuery.or(
              `branch_id.eq.${scope.branch_id},branch_id.is.null`,
            );
          } else {
            destQuery = destQuery.is("branch_id", null);
          }

          const { data: dests } = await destQuery;

          for (const dest of dests ?? []) {
            await sendTelegramMessage({
              botToken,
              chatId: dest.chat_id,
              text: summaryMsg,
            }).catch((err: unknown) => {
              console.error(
                "[cron/feedback-daily-report] telegram error dest=%s err=%s",
                redactTelegramToken(dest.chat_id, botToken),
                String(err),
              );
            });
          }
        }
      } catch (err) {
        console.error(
          "[cron/feedback-daily-report] scope error tenant=%d branch=%s",
          tenantId,
          scope.branch_id,
          err,
        );
        counters.errors += 1;
      }
    }
  }

  return NextResponse.json({ ok: true, report_date: reportDate, ...counters });
}

export const GET = POST;
