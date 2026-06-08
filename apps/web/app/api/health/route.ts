import { NextResponse } from "next/server";
import { checkHddtConfig } from "@lib/hddt-config-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health probe. Surfaces the HĐĐT config-guard (audit HDDT-01) so a probe or
 * an admin banner can alert when a production deploy would silently degrade
 * e-invoicing to internal drafts. No secrets are returned — only an ok flag
 * and machine-readable problem codes.
 */
export async function GET() {
  const hddt = checkHddtConfig();

  return NextResponse.json(
    {
      status: hddt.ok ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      hddt: {
        ok: hddt.ok,
        problems: hddt.problems,
      },
    },
    // 503 when HĐĐT is misconfigured so an uptime probe flags it loudly.
    { status: hddt.ok ? 200 : 503 },
  );
}
