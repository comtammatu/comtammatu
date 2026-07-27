import { redirect } from "next/navigation";
import { AppEmptyState, AppPageHeader } from "@/components/surface";
import { currentUserHasAnyPermissionAny } from "@/_lib/permissions";
import { UNITS_MASTER_PERMISSIONS } from "../../_lib/catalog-permissions";
import { messages } from "@lib/messages";
import { fetchUnits, type UnitRow } from "./units-actions";
import { UnitsClient } from "./units-client";
import { InventoryListFrame } from "../../_components/inventory-list-frame";

const copy = messages.inventoryMaster.units;

export default async function InventoryUnitsPage() {
  const canEdit = await currentUserHasAnyPermissionAny(
    UNITS_MASTER_PERMISSIONS,
  );
  if (!canEdit) {
    // Fail closed: page is gated by inventory:units_master or inventory:write.
    redirect("/inventory/settings");
  }

  const res = await fetchUnits();
  const rows: UnitRow[] = res.success ? (res.data ?? []) : [];

  return (
    <div className="flex flex-col gap-4">
      <AppPageHeader
        eyebrow={messages.inventory.shell.moduleName}
        title={copy.page.title}
        description={copy.page.description}
      />

      {res.success ? (
        <UnitsClient rows={rows} />
      ) : (
        <InventoryListFrame>
          <AppEmptyState
            mode="error"
            title={messages.inventory.settings.units.loadFailed}
          />
        </InventoryListFrame>
      )}
    </div>
  );
}
