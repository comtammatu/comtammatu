import { notFound } from "next/navigation";
import { fetchIngredients } from "@/(protected)/inventory/ingredient-actions";
import {
  ThresholdsClient,
  type ThresholdRow,
} from "@/(protected)/inventory/settings/thresholds/thresholds-client";
import { messages } from "@lib/messages";
import { AppEmptyState } from "@/components/surface";
import {
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";
import { CatalogBackControl } from "../catalog-back-header";

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
      minStock: row.min_stock_level == null ? "" : String(row.min_stock_level),
      reorderPoint: row.reorder_point == null ? "" : String(row.reorder_point),
      maxStock: row.max_stock_level == null ? "" : String(row.max_stock_level),
    }));

  return (
    <BranchOperatorPage title={copy.title} hideHeaderOnMobile>
      <CatalogBackControl
        title={copy.title}
        backHref={`/br/${branchId}/stock/catalog`}
      />
      {rows.length === 0 ? (
        <AppEmptyState compact title={copy.empty} symbol="riceGrain" />
      ) : (
        <BranchOperatorPanel contentFlush>
          <ThresholdsClient rows={rows} />
        </BranchOperatorPanel>
      )}
    </BranchOperatorPage>
  );
}
