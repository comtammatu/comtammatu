import { redirect } from "next/navigation";
import { canAccess } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { EmptyStatePanel } from "@/admin/components/empty-state-panel";
import { getFeatureFlagMatrix } from "@/inventory/feature-flag-actions";
import { FeatureFlagsClient } from "./feature-flags-client";

export const dynamic = "force-dynamic";

export default async function FeatureFlagsAdminPage() {
  const { claims } = await loadAuthState();
  if (!canAccess(claims.user_role, "inventory_admin")) redirect("/");

  const res = await getFeatureFlagMatrix();
  if (!res.success || !res.data) {
    return (
      <EmptyStatePanel
        mode="error"
        title={res.success ? "Không tải được feature flag" : res.error}
      />
    );
  }

  return <FeatureFlagsClient matrix={res.data} />;
}
