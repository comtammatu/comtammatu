import { getInventoryValueVisibility } from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { loadAuthState } from "@/_lib/auth";
import { PageHero } from "@/components/page-hero";
import { InventoryValuePanel } from "@/inventory/inventory-value-panel";

export default async function InventoryValueReportPage() {
  const { claims } = await loadAuthState();
  const inventoryValueVisibility = getInventoryValueVisibility(claims.user_role);

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHero eyebrow={APP_COPY_VI.executiveReporting} title="Giá trị tồn kho" />
      <InventoryValuePanel visibility={inventoryValueVisibility} />
    </div>
  );
}
