import { redirect } from "next/navigation";
import { AppEmptyState, AppPageHeader } from "@/components/surface";
import { currentUserHasAnyPermissionAny } from "@/_lib/permissions";
import { CATALOG_MANAGE_PERMISSIONS } from "../../_lib/catalog-permissions";
import { messages } from "@lib/messages";
import { fetchCategories, type CategoryRow } from "./categories-actions";
import { CategoriesClient } from "./categories-client";
import { InventoryListFrame } from "../../_components/inventory-list-frame";

const copy = messages.inventoryMaster.categories;

export default async function InventoryCategoriesPage() {
  const canEdit = await currentUserHasAnyPermissionAny(
    CATALOG_MANAGE_PERMISSIONS,
  );
  if (!canEdit) {
    // Fail closed: page is gated by inventory:write.
    redirect("/inventory/settings");
  }

  const res = await fetchCategories();
  const rows: CategoryRow[] = res.success ? (res.data ?? []) : [];

  return (
    <>
      {res.success ? (
        <CategoriesClient rows={rows} />
      ) : (
        <>
          <AppPageHeader
            eyebrow={messages.inventory.shell.moduleName}
            title={copy.page.title}
            description={copy.page.description}
          />
          <InventoryListFrame>
            <AppEmptyState
              mode="error"
              title={messages.inventory.settings.categories.loadFailed}
            />
          </InventoryListFrame>
        </>
      )}
    </>
  );
}
