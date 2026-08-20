/**
 * Auto-approve leftover Kết ca requests after the manager wait window.
 *
 * Auth: Bearer CRON_SECRET.
 * Schedule: every 15 minutes (vercel.json).
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { getCronSecret } from "@comtammatu/shared/runtime";
import { autoApproveStaleCheckouts } from "@lib/staff-runtime/_lib/checkout-auto-approve";

export const maxDuration = 300;

function timingSafeEquals(a: string, b: string): boolean {
  const max = 256;
  const left = Buffer.alloc(max);
  const right = Buffer.alloc(max);
  left.write(a.slice(0, max), "utf8");
  right.write(b.slice(0, max), "utf8");
  return timingSafeEqual(left, right) && a.length === b.length;
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
    console.error(
      "[cron/attendance-checkout-auto-approve] CRON_SECRET not configured",
    );
    return NextResponse.json(
      { ok: false, error: "not configured" },
      { status: 500 },
    );
  }

  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!provided || !timingSafeEquals(provided, expected)) {
    return unauthorized();
  }

  try {
    const result = await autoApproveStaleCheckouts(createServiceClient());
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown";
    console.error("[cron/attendance-checkout-auto-approve] worker failed", {
      code: code.slice(0, 64),
    });
    return NextResponse.json(
      { ok: false, error: "worker failed" },
      { status: 500 },
    );
  }
}

export const GET = POST;
