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

  return (
    <div className="flex gap-8 items-start">
      <InventorySubNav showProcurement={showProcurement} />
      <div className="flex-1 min-w-0 space-y-6">{children}</div>
    </div>
  );
}
