import { NextResponse } from "next/server";
import { createClient } from "@comtammatu/database/supabase/server";
import { rateLimit } from "@comtammatu/security";

export async function POST(request: Request) {
  // Rate limit by IP before auth. Fail open if Upstash is misconfigured —
  // signout must never 500, otherwise users get stuck in a broken session.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    const { success: allowed } = await rateLimit.limit(`signout:${ip}`);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  } catch (error) {
    console.error("signout rateLimit.limit failed (fail-open)", { ip, error });
  }

  const supabase = await createClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
