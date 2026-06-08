/**
 * HĐĐT reconcile cron — Path B (audit 2026-05-13).
 *
 * Auth: Bearer CRON_SECRET (timing-safe compare). Same pattern as
 *       /api/cron/hddt-daily-summary.
 * Flag: HDDT_RECONCILE_ENABLED=true to run; default off.
 * Schedule (recommended): *\/5 * * * * (every 5 min).
 *
 * Per branch (failure isolated): fetch pollable rows → poll provider
 * → state-machine transition → audit row. See apps/web/lib/hddt-reconcile.ts
 * for the orchestrator.
 */

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { getCronSecret } from "@comtammatu/shared/cron";
import { getInvoiceProvider } from "@comtammatu/shared/providers";
import { ensureInvoiceProviderRegistered } from "@lib/invoice-provider-init";
import { executeReconcileRunForBranch } from "@lib/hddt-reconcile";

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
  const enabled = (process.env["HDDT_RECONCILE_ENABLED"] ?? "false") === "true";
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
  const startedAt = Date.now();

  const { data: branches, error: branchesErr } = await supabase
    .from("branches")
    .select("id")
    .eq("is_active", true)
    .eq("branch_kind", "branch");

  if (branchesErr) {
    return NextResponse.json(
      { ok: false, error: "branches_query_failed" },
      { status: 500 },
    );
  }
  if (!branches || branches.length === 0) {
    return NextResponse.json({ ok: true, branches: [] });
  }

  const perBranch = [];
  const totals = {
    branches_processed: 0,
    candidates: 0,
    transitioned: 0,
    no_change: 0,
    race_lost: 0,
    provider_error: 0,
    unknown_status: 0,
    giveup_24h: 0,
    budget_exceeded: false as boolean,
  };

  for (const branch of branches) {
    totals.branches_processed += 1;
    try {
      const result = await executeReconcileRunForBranch(
        {
          supabase,
          provider,
          triggerSource: "cron",
          triggeredBy: null,
          startedAt,
        },
        branch.id,
      );
      perBranch.push(result);
      totals.candidates += result.candidates;
      totals.transitioned += result.transitioned;
      totals.no_change += result.no_change;
      totals.race_lost += result.race_lost;
      totals.provider_error += result.provider_error;
      totals.unknown_status += result.unknown_status;
      totals.giveup_24h += result.giveup_24h;
      if (result.budget_exceeded) totals.budget_exceeded = true;
    } catch (e) {
      console.error(
        "[cron/hddt-reconcile] branch failed id=%d err=%o",
        branch.id,
        e,
      );
      perBranch.push({
        branchId: branch.id,
        candidates: 0,
        transitioned: 0,
        no_change: 0,
        race_lost: 0,
        provider_error: 1,
        unknown_status: 0,
        giveup_24h: 0,
        budget_exceeded: false,
        error: e instanceof Error ? e.message : "branch_exception",
      });
      totals.provider_error += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    elapsed_ms: Date.now() - startedAt,
    totals,
    branches: perBranch,
  });
}

export const GET = POST;
