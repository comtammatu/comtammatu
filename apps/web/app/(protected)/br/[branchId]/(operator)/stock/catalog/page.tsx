import { notFound } from "next/navigation";
import { AppBackLink } from "@/components/surface";
import { fetchCategories } from "@/(protected)/inventory/settings/categories/categories-actions";
import { fetchUnits } from "@/(protected)/inventory/settings/units/units-actions";
import { fetchIngredients } from "@/(protected)/inventory/ingredient-actions";
import { fetchSuppliers } from "@/(protected)/inventory/procurement-actions";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";
import { CatalogIndexClient } from "./catalog-index-client";
import { CatalogPageShell } from "./catalog-page-shell";

const copy = messages.catalog.index;

export default async function OperatorCatalogPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  return (
    <CatalogPageShell
      title={copy.title}
      back={
        branchId != null ? (
          <AppBackLink href={`/br/${branchId}/stock`} />
        ) : undefined
      }
    >
      <CatalogIndex params={params} />
    </CatalogPageShell>
  );
}

async function CatalogIndex({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const [categories, ingredients, units, suppliers] = await Promise.all([
    fetchCategories(),
    fetchIngredients(),
    fetchUnits(),
    fetchSuppliers(),
  ]);

  const categoryCount = categories.success ? (categories.data?.length ?? 0) : 0;
  const ingredientRows = ingredients.success
    ? ((ingredients.data ?? []) as Array<{ is_active: boolean }>)
    : [];
  const activeIngredientCount = ingredientRows.filter(
    (row) => row.is_active !== false,
  ).length;
  // Match the units sub-list, which shows only packaging units — standard
  // (system-seeded) units are hidden, so counting them would overcount the badge.
  const unitCount = units.success
    ? ((units.data ?? []) as Array<{ is_standard: boolean }>).filter(
        (row) => !row.is_standard,
      ).length
    : 0;
  const supplierCount = suppliers.success
    ? ((suppliers.data as unknown[] | undefined)?.length ?? 0)
    : 0;

  return (
    <CatalogIndexClient
      basePath={`/br/${branchId}/stock/catalog`}
      counts={{
        categories: categoryCount,
        ingredients: activeIngredientCount,
        units: unitCount,
        thresholds: activeIngredientCount,
        suppliers: supplierCount,
      }}
    />
  );
}
