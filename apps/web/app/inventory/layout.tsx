import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  buildLoginBlockedStatePath,
  canAccess,
  extractClaims,
} from "@comtammatu/shared/auth";
import { InventoryShell } from "./_components/inventory-shell";
import { fetchInventorySiteContext } from "./_lib/headquarters";

export default async function InventoryLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/login");

  const claims = extractClaims(session.user.app_metadata);
  if (!claims) {
    redirect(buildLoginBlockedStatePath());
  }

  if (!canAccess(claims.user_role, "inventory")) {
    redirect("/employee?forbidden=1&reason=insufficient-permission");
  }

  const siteContext = await fetchInventorySiteContext(
    supabase,
    claims.tenant_id,
    claims.branch_id,
  );
  const resolvedSiteContext =
    siteContext ??
    (claims.user_role === "super_manager" ||
    claims.user_role === "owner" ||
    claims.user_role === "office"
      ? {
          branchName: "Trụ sở",
          branchKind: "headquarters" as const,
        }
      : {
          branchName: "Điểm vận hành",
          branchKind: "branch" as const,
        });

  return (
    <InventoryShell
      user={{
        name:
          session.user.user_metadata?.["display_name"] ??
          session.user.email ??
          "",
      }}
      userRole={claims.user_role}
      siteName={resolvedSiteContext.branchName}
      siteKind={resolvedSiteContext.branchKind}
    >
      {children}
    </InventoryShell>
  );
}
