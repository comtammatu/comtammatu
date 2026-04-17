import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  canAccess,
  extractClaims,
  PROCUREMENT_ROLES,
} from "@comtammatu/shared/auth";
import { MobileDraftsClient } from "./page-client";

export default async function MobileDraftsPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const claims = extractClaims(session.user.app_metadata);
  if (!claims) redirect("/login");

  if (
    !PROCUREMENT_ROLES.includes(claims.user_role) ||
    !canAccess(claims.user_role, "inventory_procurement")
  ) {
    redirect("/inventory/m?forbidden=1");
  }

  return (
    <MobileDraftsClient userKey={`u${claims.user_role}-${claims.tenant_id}`} />
  );
}
