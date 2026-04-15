import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  buildLoginBlockedStatePath,
  canAccess,
  extractClaims,
} from "@comtammatu/shared/auth";
import { getSurfaceShellClassName } from "@comtammatu/ui";
import { InventorySidebar } from "./_components/inventory-sidebar";
import { InventoryHeader } from "./_components/inventory-header";
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
    <div
      className={getSurfaceShellClassName(
        "inventory",
        "relative isolate flex h-dvh overflow-hidden font-sans",
      )}
    >
      <div className="relative z-10">
        <InventorySidebar userRole={claims.user_role} />
      </div>
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <InventoryHeader
          siteName={resolvedSiteContext.branchName}
          siteKind={resolvedSiteContext.branchKind}
          userRole={claims.user_role}
        />
        <main className="flex-1 overflow-y-auto bg-gradient-to-b from-background/76 via-background/94 to-muted/20 px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-screen-2xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
