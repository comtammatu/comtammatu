import { redirect } from "next/navigation";
import { buildAccessDeniedPath } from "@comtammatu/shared/auth";
import { currentUserHasAnyPermissionAny } from "@/_lib/permissions";
import { CATALOG_MANAGE_PERMISSIONS } from "../_lib/catalog-permissions";
import {
  fetchCategoryOptions,
  fetchIngredients,
  fetchUnitOptions,
} from "../ingredient-actions";
import { IngredientsClient } from "./ingredients-client";
import type {
  CategoryOption,
  IngredientRow,
  UnitOption,
} from "@lib/inventory/types";

export default async function IngredientsPage() {
  const canManageCatalog = await currentUserHasAnyPermissionAny(
    CATALOG_MANAGE_PERMISSIONS,
  );
  if (!canManageCatalog) {
    redirect(
      buildAccessDeniedPath("insufficient-permission", {
        from: "/inventory/ingredients",
      }),
    );
  }

  const [result, unitsResult, categoriesResult] = await Promise.all([
    fetchIngredients(),
    fetchUnitOptions(),
    fetchCategoryOptions(),
  ]);

  const initial: IngredientRow[] = result.success
    ? (result.data as IngredientRow[])
    : [];
  const unitOptions: UnitOption[] = unitsResult.success
    ? (unitsResult.data ?? [])
    : [];
  const categoryOptions: CategoryOption[] = categoriesResult.success
    ? (categoriesResult.data ?? [])
    : [];

  return (
    <IngredientsClient
      initial={initial}
      unitOptions={unitOptions}
      categoryOptions={categoryOptions}
    />
  );
}
