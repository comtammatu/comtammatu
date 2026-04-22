import type { ReactNode } from "react";
import { loadAuthState } from "../_lib/auth";
import { InventoryShell } from "./_components/inventory-shell";
import { fetchInventorySiteContext } from "./_lib/procurement-branches";

export default async function InventoryLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { supabase, session, claims } = await loadAuthState();
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
          branchName: "Kho tổng",
          branchKind: "central_warehouse" as const,
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
