/**
 * KDS queue maintenance cron worker.
 *
 * Auth: Bearer CRON_SECRET.
 * Schedule: 0 5,11,17,23 * * * UTC = 12:00, 18:00, 00:00, 06:00 ICT.
 *
 * Deletes active KDS queue tickets only. This intentionally does not mutate
 * POS orders, order_items, payment rows, kitchen batches, or daily counters.
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { getCronSecret } from "@comtammatu/shared/runtime";
import {
  getKdsCleanupCutoffIso,
  getKdsResetBeforeLocalDate,
} from "@comtammatu/shared/kds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    console.error("[cron/kds-maintenance] CRON_SECRET not configured");
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

  const now = new Date();
  const olderThan = getKdsCleanupCutoffIso(now);
  const resetBeforeLocalDate = getKdsResetBeforeLocalDate(now);
  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc("cleanup_kds_tickets_as_system", {
    p_older_than: olderThan,
    p_reset_before_local_date: resetBeforeLocalDate,
  });

  if (error) {
    console.error("[cron/kds-maintenance] rpc error code=%s", error.code);
    return NextResponse.json(
      { ok: false, error: "rpc failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    older_than: olderThan,
    reset_before_local_date: resetBeforeLocalDate,
    result: data,
  });
}

export const GET = POST;
