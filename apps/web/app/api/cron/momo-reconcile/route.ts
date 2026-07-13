import { NextResponse } from "next/server";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import {
  getCronSecret,
  timingSafeSecretEquals,
} from "@comtammatu/shared/runtime";
import { executeMomoReconciliationBatch } from "@lib/payments/momo-reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const expected = getCronSecret();
  const authHeader = request.headers.get("authorization");
  const provided = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  if (!expected || !provided || !timingSafeSecretEquals(provided, expected)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const supabase = createServiceClient();
  try {
    const result = await executeMomoReconciliationBatch(supabase);
    const incompleteCount =
      result.release_failed +
      result.settlement_error +
      result.settlement_rejected +
      result.review_required +
      result.query_error;
    if (incompleteCount > 0) {
      console.error(
        "[cron/momo-reconcile] incomplete count=%d release_failed=%d settlement_error=%d settlement_rejected=%d review_required=%d query_error=%d",
        incompleteCount,
        result.release_failed,
        result.settlement_error,
        result.settlement_rejected,
        result.review_required,
        result.query_error,
      );
    }
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error(
      "[cron/momo-reconcile] execution failed type=%s",
      error instanceof Error ? error.name : "unknown",
    );
    return NextResponse.json(
      { ok: false, error: "reconciliation_failed" },
      { status: 500 },
    );
  }
}

export const GET = POST;
