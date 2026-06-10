/**
 * Daily B2C summary HĐĐT cron worker.
 *
 * Auth: Bearer CRON_SECRET (timing-safe compare).
 * Flag: HDDT_DAILY_SUMMARY_ENABLED=true to run; default off until Viettel
 *       S-invoice template registration is ready for daily summary.
 * Schedule (PR-6): 5 19 * * * UTC = 02:05 ICT next-day. summary_date =
 *                  yesterday in VN.
 *
 * Per branch (skip-and-continue, 1 transaction per branch):
 *   1. INSERT summary_run_queue { trigger_source:'cron', status:'running' }.
 *   2. executeSummaryRun helper (apps/web/lib/hddt-daily-summary.ts) —
 *      shared with admin manual trigger action.
 *   3. Counter ++ outcome.
 *
 * Failure isolation: per-branch try/catch in helper — branch failure logs
 * in queue + counter, never aborts batch.
 */

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { getCronSecret } from "@comtammatu/shared/runtime";
import { getInvoiceProvider } from "@comtammatu/shared/providers";
import { getYesterdayVNDateString } from "@comtammatu/shared/time";
import { ensureInvoiceProviderRegistered } from "@lib/invoice-provider-init";
import { executeSummaryRun } from "@lib/hddt-daily-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const enabled =
    (process.env["HDDT_DAILY_SUMMARY_ENABLED"] ?? "false") === "true";
  if (!enabled) {
    return NextResponse.json({ ok: true, skipped: "feature_flag_off" });
  }

  const expected = getCronSecret();
  const authHeader = request.headers.get("authorization");
  const provided = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  if (!provided || !timingSafeEquals(provided, expected)) {
    return unauthorized();
  }

  ensureInvoiceProviderRegistered();
  const provider = getInvoiceProvider();
  if (!provider) {
    return NextResponse.json(
      { ok: false, error: "invoice_provider_not_configured" },
      { status: 503 },
    );
  }

  const supabase = createServiceClient();
  const summaryDate = getYesterdayVNDateString();

  const counters = {
    branches_processed: 0,
    issued: 0,
    submitted: 0,
    skipped: 0,
    failed: 0,
  };

  const { data: branches, error: branchesErr } = await supabase
    .from("branches")
    .select("id, tenant_id")
    .eq("is_active", true)
    .eq("branch_kind", "branch");

  if (branchesErr) {
    return NextResponse.json(
      { ok: false, error: "branches_query_failed" },
      { status: 500 },
    );
  }
  if (!branches || branches.length === 0) {
    return NextResponse.json({
      ok: true,
      summary_date: summaryDate,
      ...counters,
    });
  }

  for (const branch of branches) {
    counters.branches_processed += 1;

    const { data: queueRow, error: queueErr } = await supabase
      .from("summary_run_queue")
      .insert({
        tenant_id: branch.tenant_id,
        branch_id: branch.id,
        summary_date: summaryDate,
        trigger_source: "cron",
        triggered_by: null,
        status: "running",
        attempt_count: 1,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (queueErr || !queueRow) {
      console.error(
        "[cron/hddt-daily-summary] queue insert failed branch=%d err=%o",
        branch.id,
        queueErr,
      );
      counters.failed += 1;
      continue;
    }

    const result = await executeSummaryRun({
      supabase,
      provider,
      branchId: branch.id,
      summaryDate,
      queueId: queueRow.id,
    });

    if (result.outcome === "issued") counters.issued += 1;
    else if (result.outcome === "submitted") counters.submitted += 1;
    else if (result.outcome === "skipped") counters.skipped += 1;
    else counters.failed += 1;
  }

  return NextResponse.json({
    ok: true,
    summary_date: summaryDate,
    ...counters,
  });
}

export const GET = POST;
