import { redirect } from "next/navigation";
import {
  AppEmptyState,
  AppPageHeader,
  AppSection,
} from "@/components/surface";
import { currentUserHasAnyPermissionAny } from "@/_lib/permissions";
import { CATALOG_MANAGE_PERMISSIONS } from "../../_lib/catalog-permissions";
import { messages } from "@lib/messages";
import { fetchCategories, type CategoryRow } from "./categories-actions";
import { CategoriesClient } from "./categories-client";

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
    <div className="flex flex-col gap-4">
      <AppPageHeader
        eyebrow={copy.page.eyebrow}
        title={copy.page.title}
        description={copy.page.description}
      />

      {res.success ? (
        <AppSection contentFlush>
          <CategoriesClient rows={rows} />
        </AppSection>
      ) : (
        <AppEmptyState
          mode="error"
          title={messages.inventory.settings.categories.loadFailed}
        />
      )}
    </div>
  );
}
