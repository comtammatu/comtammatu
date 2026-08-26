import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getCronSecret } from "@comtammatu/shared/runtime";
import { runTaxInvoiceIssueWorker } from "@lib/tax-invoice-issue-worker";

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
  const startedAt = Date.now();
  const requestId = request.headers.get("x-vercel-id");
  const expected = getCronSecret();
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!expected || !provided || !timingSafeEquals(provided, expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const rawJobId = new URL(request.url).searchParams.get("jobId");
  const jobId = rawJobId === null ? undefined : Number(rawJobId);
  if (jobId !== undefined && (!Number.isSafeInteger(jobId) || jobId <= 0)) {
    return NextResponse.json({ ok: false, error: "invalid job id" }, { status: 400 });
  }

  try {
    console.log(
      JSON.stringify({
        level: "info",
        message: "Tax invoice issue worker started",
        route: "/api/cron/tax-invoice-issue",
        requestId,
        jobId: jobId ?? null,
      }),
    );
    const summary = await runTaxInvoiceIssueWorker(jobId);
    console.log(
      JSON.stringify({
        level: "info",
        message: "Tax invoice issue worker completed",
        route: "/api/cron/tax-invoice-issue",
        requestId,
        jobId: jobId ?? null,
        durationMs: Date.now() - startedAt,
        ...summary,
      }),
    );
    return NextResponse.json({
      ok: true,
      ...summary,
    });
  } catch (error) {
    const code =
      error instanceof Error && error.message === "claim_failed"
        ? "claim_failed"
        : error instanceof Error
          ? error.name
          : "unknown";
    console.error("[cron/tax-invoice-issue] worker failed", {
      code: code.slice(0, 64),
    });
    return NextResponse.json({ ok: false, error: "worker failed" }, { status: 500 });
  }
}

export const GET = POST;
