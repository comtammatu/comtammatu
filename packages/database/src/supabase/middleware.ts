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
    error.code === "session_expired" ||
    error.code === "session_not_found"
  ) {
    return true;
  }
  return (
    error.code === "validation_failed" &&
    "message" in error &&
    error.message === "Refresh token is not valid"
  );
}

function isTerminalRefreshErrorBody(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const code =
    "error_code" in body && typeof body.error_code === "string"
      ? body.error_code
      : "code" in body && typeof body.code === "string"
        ? body.code
        : null;
  if (!code) return false;
  if (
    code === "refresh_token_not_found" ||
    code === "refresh_token_already_used" ||
    code === "session_expired" ||
    code === "session_not_found"
  ) {
    return true;
  }
  const message =
    "msg" in body && typeof body.msg === "string"
      ? body.msg
      : "message" in body && typeof body.message === "string"
        ? body.message
        : null;
  return code === "validation_failed" && message === "Refresh token is not valid";
}

function isRefreshTokenGrantRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): boolean {
  if (init?.method?.toUpperCase() !== "POST") return false;
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

function isAuthRefreshSocketClose(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  error: unknown,
): boolean {
  if (!isRefreshTokenGrantRequest(input, init)) return false;

  const cause =
    typeof error === "object" && error !== null && "cause" in error
      ? error.cause
      : null;
  const code =
    typeof cause === "object" && cause !== null && "code" in cause
      ? cause.code
      : null;
  return code === "UND_ERR_SOCKET";
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
 * cryptographically verified. Auth-session liveness for mutations lives in
 * `withAction` / `resolveActionContext` (`apps/web/app/_lib/with-action.ts`);
 * protected RSC liveness lives in `loadAuthState` → `probeAuthSessionLiveness`.
 * Never put `getUser()` in proxy/middleware or in RSC `getAuthContext`
 * (GRN false-deny).
 *
 * When refresh fails with a terminal Auth error but auth-js proactive-preserve
 * would keep a still-valid access JWT (zombie after global signOut), this
 * middleware path forces anonymous + deletion cookies. That override is
 * middleware-only — do not put `getUser()` here.
 *
 * Returns `session` (not `user`) so callers can pivot routing on
 * `claims = extractClaimsFromAccessToken(session?.access_token)`. Avoid
 * accessing `session.user.*` directly — `@supabase/auth-js` wraps it in
 * `insecureUserWarningProxy` on the server, which spams logs on every read.
 *
 * Spec: regressions.md `PROXY-NEVER-CALL-GETUSER` + `ZOMBIE-JWT-AFTER-GLOBAL-SIGNOUT`.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  let terminalRefreshSeen = false;

  const baseFetch = createAuthSocketRetryFetch();
  const fetchWithTerminalRefreshWatch: typeof fetch = async (input, init) => {
    const response = await baseFetch(input, init);
    if (!isRefreshTokenGrantRequest(input, init) || response.ok) {
      return response;
    }
    try {
      const body: unknown = await response.clone().json();
      if (isTerminalRefreshErrorBody(body)) {
        terminalRefreshSeen = true;
      }
    } catch {
      // Non-JSON refresh failures stay loud via getSession error path.
    }
    return response;
  };

  const supabase = createServerClient<Database>(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      global: { fetch: fetchWithTerminalRefreshWatch },
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

  // auth-js proactive-preserve: terminal refresh + still-valid access → session
  // kept with error:null. Override in middleware only so peer tabs after global
  // signOut become anonymous instead of admitting a zombie JWT.
  if (session && terminalRefreshSeen) {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (error) {
      if (!isTerminalSessionError(error)) throw error;
    }
    session = null;
  }

  return { supabase, session, response: supabaseResponse };
}
