import { notFound } from "next/navigation";
import {
  fetchIngredients,
  fetchUnitOptions,
  fetchCategoryOptions,
} from "@/(protected)/inventory/ingredient-actions";
import type {
  CategoryOption,
  IngredientRow,
  UnitOption,
} from "@lib/inventory/types";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";
import { CatalogIngredientsClient } from "./catalog-ingredients-client";

const copy = messages.catalog.ingredients;

export default async function OperatorCatalogIngredientsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const [ingredients, unitOptions, categoryOptions] = await Promise.all([
    fetchIngredients(),
    fetchUnitOptions(),
    fetchCategoryOptions(),
  ]);

  const rows: IngredientRow[] = ingredients.success
    ? ((ingredients.data ?? []) as IngredientRow[])
    : [];
  const units: UnitOption[] = unitOptions.success
    ? (unitOptions.data ?? [])
    : [];
  const categories: CategoryOption[] = categoryOptions.success
    ? (categoryOptions.data ?? [])
    : [];

  return (
    <BranchOperatorPage title={copy.title} hideHeaderOnMobile>
      <CatalogIngredientsClient
        backHref={`/br/${branchId}/stock/catalog`}
        initial={rows}
        unitOptions={units}
        categoryOptions={categories}
      />
    </BranchOperatorPage>
  );
}
