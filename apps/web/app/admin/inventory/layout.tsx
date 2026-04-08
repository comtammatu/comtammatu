import type { ReactNode } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims, canAccess } from "@comtammatu/shared/auth";
import { InventorySubNav } from "./inventory-sub-nav";

export default async function InventoryLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = session?.user
    ? extractClaims(session.user.app_metadata)
    : null;
  const showProcurement = claims
    ? canAccess(claims.user_role, "inventory_procurement")
    : false;
  const showBranchIngredientSettings = claims?.user_role === "super_manager";

  return (
    <div className="space-y-6">
      <InventorySubNav
        showProcurement={showProcurement}
        showBranchIngredientSettings={showBranchIngredientSettings}
      />
      {children}
    </div>
  );
}
