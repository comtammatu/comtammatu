import { getInventoryValueVisibility } from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { loadAuthState } from "@/_lib/auth";
import { AppPage, AppPageHeader } from "@/components/surface";
import { InventoryValuePanel } from "@/inventory/inventory-value-panel";

export default async function InventoryValueReportPage() {
  const { claims } = await loadAuthState();
  const inventoryValueVisibility = getInventoryValueVisibility(claims.user_role);

  return (
    <AppPage>
      <AppPageHeader eyebrow={APP_COPY_VI.executiveReporting} title="Giá trị tồn kho" />
      <InventoryValuePanel visibility={inventoryValueVisibility} />
    </AppPage>
  );
}
