import { notFound } from "next/navigation";
import { fetchIngredients } from "@/(protected)/inventory/ingredient-actions";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";
import { CatalogPageShell } from "../catalog-page-shell";
import {
  CatalogThresholdsClient,
  type ThresholdRow,
} from "./catalog-thresholds-client";

const copy = messages.catalog.thresholds;

export default function OperatorCatalogThresholdsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  return (
    <CatalogPageShell title={copy.title}>
      <CatalogThresholdsBody params={params} />
    </CatalogPageShell>
  );
}

async function CatalogThresholdsBody({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  if (parseOperatorBranchId(rawBranchId) == null) notFound();

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

  return <CatalogThresholdsClient rows={rows} />;
}
