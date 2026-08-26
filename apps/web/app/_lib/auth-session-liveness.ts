import { redirect } from "next/navigation";
import type { createClient } from "@comtammatu/database/supabase/server";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Route Handler that can Set-Cookie (RSC `cookies().set` often no-ops).
 * Used when Auth session is revoked but the access JWT cookie is still valid.
 */
export const AUTH_SESSION_CLEAR_PATH = "/api/auth/signout";

export function isRevokedAuthSessionError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("name" in error && error.name === "AuthSessionMissingError") return true;
  if (!("code" in error)) return false;
  return (
    error.code === "session_not_found" ||
    error.code === "session_expired" ||
    error.code === "refresh_token_not_found" ||
    error.code === "refresh_token_already_used"
  );
}

/**
 * Protected RSC / layout Auth liveness. Far-from-expiry access JWTs never hit
 * middleware `/token` refresh, so a globally signed-out peer tab can still
 * pass `getSession()` until near `EXPIRY_MARGIN_MS`. Probe Auth once per
 * request (callers wrap via React `cache` on `loadAuthState`).
 *
 * On revoke → redirect to the signout Route Handler (Set-Cookie + /login).
 * Do NOT put this in `getAuthContext` (GRN/expense false-deny) or proxy
 * (`PROXY-NEVER-CALL-GETUSER`). Incomplete fakes without `getUser` skip.
 * Receives the access token already read by `loadAuthState` so auth-js goes
 * straight to `/user` without acquiring its session lock and reading cookies
 * again. Returns the verified user so shell callers never need to read the
 * unverified `session.user` cookie payload.
 *
 * Spec: regressions.md `ZOMBIE-JWT-AFTER-GLOBAL-SIGNOUT`.
 */
export async function probeAuthSessionLiveness(
  supabase: ServerSupabase,
  accessToken: string,
) {
  const getUser = supabase.auth?.getUser;
  if (typeof getUser !== "function") return null;

  const {
    data: { user },
    error,
  } = await getUser.call(supabase.auth, accessToken);
  if (!error) return user;
  if (!isRevokedAuthSessionError(error)) return null;

  redirect(AUTH_SESSION_CLEAR_PATH);
}
