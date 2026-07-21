import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getCronSecret } from "@comtammatu/shared/runtime";
import { runTaxInvoiceIssueWorker } from "@lib/tax-invoice-issue-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function timingSafeEquals(a: string, b: string): boolean {
  const max = 256;
  const left = Buffer.alloc(max);
  const right = Buffer.alloc(max);
  left.write(a.slice(0, max), "utf8");
  right.write(b.slice(0, max), "utf8");
  return timingSafeEqual(left, right) && a.length === b.length;
}

export async function POST(request: Request) {
  const expected = getCronSecret();
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!expected || !provided || !timingSafeEquals(provided, expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json({ ok: true, ...(await runTaxInvoiceIssueWorker()) });
  } catch {
    console.error("[cron/tax-invoice-issue] worker failed");
    return NextResponse.json({ ok: false, error: "worker failed" }, { status: 500 });
  }
}

export const GET = POST;
