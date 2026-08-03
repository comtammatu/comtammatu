import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getCronSecret } from "@comtammatu/shared/runtime";
import { runMoMoReconciliationWorker } from "@lib/momo-reconciliation-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function timingSafeEquals(left: string, right: string): boolean {
  const max = 256;
  const leftBuffer = Buffer.alloc(max);
  const rightBuffer = Buffer.alloc(max);
  leftBuffer.write(left.slice(0, max), "utf8");
  rightBuffer.write(right.slice(0, max), "utf8");
  return (
    timingSafeEqual(leftBuffer, rightBuffer) && left.length === right.length
  );
}

export async function POST(request: Request) {
  const expected = getCronSecret();
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!expected || !provided || !timingSafeEquals(provided, expected)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  try {
    return NextResponse.json({
      ok: true,
      ...(await runMoMoReconciliationWorker()),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown";
    console.error("[cron/momo-reconcile] worker failed", {
      code: code.slice(0, 64),
    });
    return NextResponse.json(
      { ok: false, error: "worker failed" },
      { status: 500 },
    );
  }
}

export const GET = POST;
