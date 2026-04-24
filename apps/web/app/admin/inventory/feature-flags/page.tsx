import { redirect } from "next/navigation";
import { canAccess } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { getFeatureFlagMatrix } from "@/inventory/feature-flag-actions";
import { FeatureFlagsClient } from "./feature-flags-client";

export const dynamic = "force-dynamic";

export default async function FeatureFlagsAdminPage() {
  const { claims } = await loadAuthState();
  if (!canAccess(claims.user_role, "inventory_admin")) redirect("/");

  const res = await getFeatureFlagMatrix();
  if (!res.success || !res.data) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        {res.success ? "Không tải được feature flag" : res.error}
      </div>
    );
  }

  return <FeatureFlagsClient matrix={res.data} />;
}
