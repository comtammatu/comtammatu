import { redirect } from "next/navigation";
import { AppPageHeader, AppEmptyState, AppSection } from "@/components/surface";
import { currentUserHasAnyPermissionAny } from "@/_lib/permissions";
import { CATALOG_MANAGE_PERMISSIONS } from "../../_lib/catalog-permissions";
import { fetchIngredients } from "../../ingredient-actions";
import { messages } from "@lib/messages";
import { ThresholdsClient, type ThresholdRow } from "./thresholds-client";

const copy = messages.inventory.settings.thresholds;

export default async function InventoryThresholdsPage() {
  const canEdit = await currentUserHasAnyPermissionAny(
    CATALOG_MANAGE_PERMISSIONS,
  );
  if (!canEdit) {
    // Fail closed: page is gated by inventory:write.
    redirect("/inventory/settings/expiry");
  }

  const res = await fetchIngredients();
  const all = res.success
    ? ((res.data ?? []) as Array<{
        id: number;
        name: string;
        sku: string | null;
        unit: string;
        purchase_unit: string | null;
        is_active: boolean;
        min_stock_level: number | string | null;
        max_stock_level: number | string | null;
        reorder_point: number | string | null;
      }>)
    : [];

  const rows: ThresholdRow[] = all
    .filter((row) => row.is_active !== false)
    .map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      unit: row.unit,
      purchaseUnit: row.purchase_unit,
      minStock: row.min_stock_level == null ? "" : String(row.min_stock_level),
      reorderPoint: row.reorder_point == null ? "" : String(row.reorder_point),
      maxStock: row.max_stock_level == null ? "" : String(row.max_stock_level),
    }));

  return (
    <div className="space-y-4">
      <AppPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
      />

      <AppSection contentFlush>
        {rows.length === 0 ? (
          <div className="px-5 py-10">
            <AppEmptyState title={copy.empty} />
          </div>
        ) : (
          <ThresholdsClient rows={rows} />
        )}
      </AppSection>
    </div>
  );
}
