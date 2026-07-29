import { notFound } from "next/navigation";
import { fetchCategories } from "@/(protected)/inventory/settings/categories/categories-actions";
import { fetchUnits } from "@/(protected)/inventory/settings/units/units-actions";
import { fetchIngredients } from "@/(protected)/inventory/ingredient-actions";
import { fetchSuppliers } from "@/(protected)/inventory/procurement-actions";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";
import { CatalogIndexClient } from "./catalog-index-client";

const copy = messages.catalog.index;

export default async function OperatorCatalogPage({
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
    <BranchOperatorPage title={copy.title} hideHeaderOnMobile>
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
    </BranchOperatorPage>
  );
}
