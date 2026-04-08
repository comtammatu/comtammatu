import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import type { StaffRole } from "@comtammatu/shared/auth";

/**
 * Get authenticated user context with role authorization.
 * Returns null if unauthenticated, no claims, or role not in allowedRoles.
 */
export async function getAuthContext(allowedRoles: readonly StaffRole[]) {
  const supabase = await createClient();

  // Use getSession() instead of getUser() to avoid an extra HTTP roundtrip
  // to Supabase Auth. The middleware (proxy.ts) already called getUser() which
  // refreshed the session cookie — so the session here is guaranteed fresh.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) return null;

  const claims = extractClaims(session.user.app_metadata);
  if (!claims) return null;

  if (!allowedRoles.includes(claims.user_role)) return null;

  return { supabase, claims, user: session.user };
}
