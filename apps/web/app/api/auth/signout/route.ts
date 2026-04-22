import { NextResponse } from "next/server";
import { createClient } from "@comtammatu/database/supabase/server";
import { getSafeInternalReturnTo, isBetaPath } from "@comtammatu/shared/auth";
import { rateLimit } from "@comtammatu/security";

export async function POST(request: Request) {
  // Rate limit by IP before auth
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { success: allowed } = await rateLimit.limit(`signout:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
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
      const loginPath = isBetaPath(refererUrl.pathname) ? "/beta/login" : "/login";

      if (returnTo && refererUrl.pathname !== loginPath) {
        target = `${loginPath}?returnTo=${encodeURIComponent(returnTo)}`;
      } else {
        target = loginPath;
      }
    } catch {
      // Ignore malformed referer and fall back to plain login.
    }
  }

  return NextResponse.redirect(new URL(target, request.url), { status: 303 });
}
