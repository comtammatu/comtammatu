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
    redirect("/inventory/settings");
  }

  const res = await fetchIngredients();
  const all = res.success
    ? ((res.data ?? []) as Array<{
        id: number;
        name: string;
        sku: string | null;
        unit: string;
        is_active: boolean;
        min_stock_level: number | string | null;
      }>)
    : [];

  const rows: ThresholdRow[] = all
    .filter((row) => row.is_active !== false)
    .map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      unit: row.unit,
      minStock: row.min_stock_level == null ? "" : String(row.min_stock_level),
    }));

  return (
    <div className="flex flex-col gap-4">
      <AppPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
      />

      <AppSection contentFlush={rows.length > 0}>
        {rows.length === 0 ? (
          <AppEmptyState title={copy.empty} symbol="riceGrain" />
        ) : (
          <ThresholdsClient rows={rows} />
        )}
      </AppSection>
    </div>
  );
}
