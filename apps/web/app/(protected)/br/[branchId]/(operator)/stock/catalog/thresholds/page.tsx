import { notFound } from "next/navigation";
import { fetchIngredients } from "@/(protected)/inventory/ingredient-actions";
import {
  ThresholdsClient,
  type ThresholdRow,
} from "@/(protected)/inventory/settings/thresholds/thresholds-client";
import { messages } from "@lib/messages";
import { AppEmptyState, AppSection } from "@/components/surface";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";
import { CatalogBackHeader } from "../catalog-back-header";

const copy = messages.catalog.thresholds;

export default async function OperatorCatalogThresholdsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

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
    <div className="flex flex-col gap-3">
      <CatalogBackHeader
        title={copy.title}
        backHref={`/br/${branchId}/stock/catalog`}
      />
      {rows.length === 0 ? (
        <AppEmptyState compact title={copy.empty} />
      ) : (
        <AppSection contentFlush>
          <ThresholdsClient rows={rows} />
        </AppSection>
      )}
    </div>
  );
}
