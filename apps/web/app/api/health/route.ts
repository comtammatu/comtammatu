import { NextResponse } from "next/server";
import { createServiceClient } from "@comtammatu/database/supabase/service";

const NO_STORE = { "Cache-Control": "no-store" } as const;

// Liveness + DB readiness. A static 200 hides a down database from uptime
// monitors; do a lightweight Postgres round-trip and fail with 503 so the
// monitor actually pages. Error details are logged server-side only.
export async function GET() {
  const timestamp = new Date().toISOString();
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("tenants").select("id").limit(1);
    if (error) {
      console.error(
        "[api/health] db check failed:",
        error.code ?? error.message,
      );
      return NextResponse.json(
        { status: "error", db: "down", timestamp },
        { status: 503, headers: NO_STORE },
      );
    }
    return NextResponse.json(
      { status: "ok", db: "ok", timestamp },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error(
      "[api/health] unexpected:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { status: "error", db: "down", timestamp },
      { status: 503, headers: NO_STORE },
    );
  }
}
