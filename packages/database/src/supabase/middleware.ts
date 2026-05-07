import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "../index";
import { getSupabaseUrl, getSupabaseAnonKey } from "./_env";

/**
 * Middleware Supabase client — reads session from cookies and persists any
 * refreshed tokens via the `setAll` callback.
 * Import: `import { updateSession } from "@comtammatu/database/supabase/middleware"`
 *
 * Uses `getSession()` (cookie decode + auto-refresh when access token is past
 * `EXPIRY_MARGIN_MS`) instead of `getUser()` (HTTP roundtrip to Supabase Auth).
 * The HTTP validation was redundant for routing decisions — JWT signature is
 * cryptographically verified, and banned-user revocation lives in Server
 * Actions via `getAuthContext` (apps/web/app/_lib/auth.ts), which still calls
 * `getUser()` for defense-in-depth on every mutation.
 *
 * Returns `session` (not `user`) so callers can pivot routing on
 * `claims = extractClaimsFromAccessToken(session?.access_token)`. Avoid
 * accessing `session.user.*` directly — `@supabase/auth-js` wraps it in
 * `insecureUserWarningProxy` on the server, which spams logs on every read.
 *
 * Spec: regressions.md `PROXY-NEVER-CALL-GETUSER` — middleware MUST NOT call
 * `getUser()`. Refresh path remains intact via `getSession()` →
 * `_callRefreshToken` → `setAll`.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return { supabase, session, response: supabaseResponse };
}
