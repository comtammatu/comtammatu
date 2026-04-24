import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  canAccess,
  extractClaimsFromAccessToken,
  PROCUREMENT_ROLES,
} from "@comtammatu/shared/auth";
import { MobileDraftsClient } from "./page-client";

export default async function MobileDraftsPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = extractClaimsFromAccessToken(session?.access_token);
  if (
    !claims ||
    !PROCUREMENT_ROLES.includes(claims.user_role) ||
    !canAccess(claims.user_role, "inventory_procurement")
  ) {
    redirect("/access-denied?reason=insufficient-permission");
  }

  return (
    <MobileDraftsClient userKey={`u${claims.user_role}-${claims.tenant_id}`} />
  );
}
