import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import type { StaffRole } from "@comtammatu/shared/auth";

/**
 * Get authenticated user context with role authorization.
 * Returns null if unauthenticated, no claims, or role not in allowedRoles.
 *
 * Canonical copy — module-level `_lib/auth.ts` files re-export from here.
 */
export async function getAuthContext(allowedRoles: readonly StaffRole[]) {
  const supabase = await createClient();

  // Server Actions use getUser() — it validates the JWT against Supabase Auth
  // server, ensuring banned/deleted users are rejected immediately.
  // Pages/layouts can use getSession() (middleware already verified), but
  // mutations must re-verify for defense in depth.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const claims = extractClaims(user.app_metadata);
  if (!claims) return null;

  if (!allowedRoles.includes(claims.user_role)) return null;

  return { supabase, claims, user };
}
