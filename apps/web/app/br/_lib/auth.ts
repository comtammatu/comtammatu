import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import type { StaffRole } from "@comtammatu/shared/auth";

/**
 * Get authenticated user context with role authorization for branch routes.
 * Returns null if unauthenticated, no claims, or role not in allowedRoles.
 */
export async function getAuthContext(allowedRoles: readonly StaffRole[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const claims = extractClaims(user.app_metadata);
  if (!claims) return null;

  if (!allowedRoles.includes(claims.user_role)) return null;

  return { supabase, claims };
}
