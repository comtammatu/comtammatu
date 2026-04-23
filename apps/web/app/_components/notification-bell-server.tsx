import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaimsFromAccessToken } from "@comtammatu/shared/auth";
import { NotificationBell } from "./notification-bell";

/**
 * Server wrapper: reads claims from the session token and hands tenantId to
 * the client bell. Renders nothing when unauthenticated so this can be
 * mounted in the root layout without gating /login or /access-denied.
 */
export async function NotificationBellServer() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const claims = extractClaimsFromAccessToken(session.access_token);
  if (!claims) return null;
  return <NotificationBell tenantId={claims.tenant_id} />;
}
