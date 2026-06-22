import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { canManageTenantStrategySettings } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";

// Owner-only gate for the tenant-strategy settings subtree (branch roster,
// chain identity, payments). Hoisted here so the leaf pages stay UI-only.
export default async function TenantSettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { claims } = await loadAuthState();

  if (!canManageTenantStrategySettings(claims.user_role)) {
    redirect("/access-denied?reason=insufficient-permission");
  }

  return <>{children}</>;
}
