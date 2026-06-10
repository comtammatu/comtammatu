import { getInventoryValueVisibility } from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { loadAuthState } from "@/_lib/auth";
import { AppPage, AppPageHeader } from "@/components/surface";
import { InventoryValuePanel } from "@/components/inventory-value-panel";
import { messages } from "@lib/messages";

export default async function InventoryValueReportPage() {
  const { claims } = await loadAuthState();
  const inventoryValueVisibility = getInventoryValueVisibility(
    claims.user_role,
  );

  return (
    <AppPage>
      <AppPageHeader
        eyebrow={APP_COPY_VI.executiveReporting}
        title={messages.admin.reports.inventoryValue.title}
      />
      <InventoryValuePanel visibility={inventoryValueVisibility} />
    </AppPage>
  );
}
