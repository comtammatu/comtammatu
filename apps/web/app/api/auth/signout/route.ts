import { NextResponse } from "next/server";
import { createClient } from "@comtammatu/database/supabase/server";
import { getSafeInternalReturnTo } from "@comtammatu/shared/auth";
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

  let target = "/login";
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const returnTo = getSafeInternalReturnTo(
        `${refererUrl.pathname}${refererUrl.search}`,
      );

      if (returnTo && refererUrl.pathname !== "/login") {
        target = `/login?returnTo=${encodeURIComponent(returnTo)}`;
      }
    } catch {
      // Ignore malformed referer and fall back to plain login.
    }
  }

  return NextResponse.redirect(new URL(target, request.url), { status: 303 });
}
