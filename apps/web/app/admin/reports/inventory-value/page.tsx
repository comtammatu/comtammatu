import { createClient } from "@comtammatu/database/supabase/server";
import {
  extractClaims,
  getInventoryValueVisibility,
} from "@comtammatu/shared/auth";
import { InventoryValuePanel } from "../../inventory/inventory-value-panel";

export default async function InventoryValueReportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const claims = user ? extractClaims(user.app_metadata) : null;
  const inventoryValueVisibility = claims
    ? getInventoryValueVisibility(claims.user_role)
    : { system: false, area: false, branch: false };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Giá trị tồn kho</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tổng hợp giá trị tồn theo phạm vi được phân quyền xem (giám sát / báo
          cáo).
        </p>
      </div>
      <InventoryValuePanel visibility={inventoryValueVisibility} />
    </div>
  );
}
