import { getInventoryValueVisibility } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { AppPage } from "@/components/surface";
import { InventoryValuePanel } from "@/components/inventory-value-panel";

// InventoryValuePanel renders this screen's header; adding AppPageHeader
// here would double it.
export default async function InventoryValueReportPage() {
  const { claims } = await loadAuthState();
  const inventoryValueVisibility = getInventoryValueVisibility(
    claims.user_role,
  );

  return (
    <AppPage>
      <InventoryValuePanel visibility={inventoryValueVisibility} />
    </AppPage>
  );
}
