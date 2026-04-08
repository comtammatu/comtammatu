import type { ReactNode } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims, canAccess } from "@comtammatu/shared/auth";
import { InventorySubNav } from "./inventory-sub-nav";
import { PageHeader } from "@/components/foundation/ui-patterns";

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
      <PageHeader
        title="Kho và mua hàng"
        description="Quản lý tồn kho, công thức, nhập hàng, chuyển kho và nhà cung cấp theo chuẩn vận hành đa chi nhánh."
      />
      <InventorySubNav
        showProcurement={showProcurement}
        showBranchIngredientSettings={showBranchIngredientSettings}
      />
      {children}
    </div>
  );
}
