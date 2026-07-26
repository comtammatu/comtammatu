import { createServerClient } from "@supabase/ssr";
import type { Session } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "../index";
import { getSupabaseUrl, getSupabaseAnonKey } from "./_env";

function isTerminalSessionError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("name" in error && error.name === "AuthSessionMissingError") return true;
  if (!("code" in error)) return false;
  if (
    error.code === "refresh_token_not_found" ||
    error.code === "refresh_token_already_used" ||
    error.code === "session_expired"
  ) {
    return true;
  }
  return (
    error.code === "validation_failed" &&
    "message" in error &&
    error.message === "Refresh token is not valid"
  );
}

function isAuthRefreshSocketClose(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  error: unknown,
): boolean {
  if (init?.method?.toUpperCase() !== "POST") return false;

  const cause =
    typeof error === "object" && error !== null && "cause" in error
      ? error.cause
      : null;
  const code =
    typeof cause === "object" && cause !== null && "code" in cause
      ? cause.code
      : null;
  if (code !== "UND_ERR_SOCKET") return false;

  const rawUrl = input instanceof Request ? input.url : String(input);
  try {
    const url = new URL(rawUrl);
    return (
      url.pathname.endsWith("/auth/v1/token") &&
      url.searchParams.get("grant_type") === "refresh_token"
    );
  } catch {
    return false;
  }
}

export function createAuthSocketRetryFetch(
  fetcher: typeof fetch = fetch,
): typeof fetch {
  let retried = false;
  return async (input, init) => {
    try {
      return await fetcher(input, init);
    } catch (error) {
      if (
        retried ||
        init?.signal?.aborted ||
        !isAuthRefreshSocketClose(input, init, error)
      ) {
        throw error;
      }
      retried = true;
      console.warn("[supabase-middleware] retrying auth refresh", {
        code: "UND_ERR_SOCKET",
        attempt: 2,
      });
      return fetcher(input, init);
    }
  };
}

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
      global: { fetch: createAuthSocketRetryFetch() },
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

  let session: Session | null = null;
  try {
    const result = await supabase.auth.getSession();
    if (result.error && !isTerminalSessionError(result.error)) {
      throw result.error;
    }
    session = result.data.session;
  } catch (error) {
    if (!isTerminalSessionError(error)) throw error;
  }

  return { supabase, session, response: supabaseResponse };
}
