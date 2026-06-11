/**
 * HĐĐT PDF/XML archive cron — Path D (audit 2026-05-13).
 *
 * Auth: Bearer CRON_SECRET (timing-safe). Same pattern as
 *       /api/cron/hddt-{daily-summary,reconcile}.
 * Flag: HDDT_ARCHIVE_ENABLED=true to run; default off.
 * Schedule (recommended): *\/15 * * * * (every 15 min).
 *
 * Per branch (failure isolated): fetch issued+not-yet-archived rows →
 * provider.downloadInvoice → sha256 → Storage upload → DB update +
 * archive_run_log row.
 *
 * Failsoft: archive failures NEVER block invoice state — invoices
 * stay `status='issued'` regardless of archive outcome.
 */

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { getCronSecret } from "@comtammatu/shared/runtime";
import { getInvoiceProvider } from "@comtammatu/shared/providers";
import { ensureInvoiceProviderRegistered } from "@lib/invoice-provider-init";
import { executeArchiveRunForBranch } from "@lib/hddt-archive";

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
  const enabled = (process.env["HDDT_ARCHIVE_ENABLED"] ?? "false") === "true";
  if (!enabled) {
    return NextResponse.json({ ok: true, skipped: "feature_flag_off" });
  }

  const expected = getCronSecret();
  const authHeader = request.headers.get("authorization");
  const provided = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  if (!expected || !provided || !timingSafeEquals(provided, expected)) {
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
    archived: 0,
    provider_error: 0,
    storage_error: 0,
    invalid_payload: 0,
    hash_mismatch: 0,
    giveup: 0,
    no_change: 0,
    budget_exceeded: false as boolean,
  };

  for (const branch of branches) {
    totals.branches_processed += 1;
    try {
      const result = await executeArchiveRunForBranch(
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
      totals.archived += result.archived;
      totals.provider_error += result.provider_error;
      totals.storage_error += result.storage_error;
      totals.invalid_payload += result.invalid_payload;
      totals.hash_mismatch += result.hash_mismatch;
      totals.giveup += result.giveup;
      totals.no_change += result.no_change;
      if (result.budget_exceeded) totals.budget_exceeded = true;
    } catch (e) {
      console.error(
        "[cron/hddt-archive] branch failed id=%d err=%o",
        branch.id,
        e,
      );
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
