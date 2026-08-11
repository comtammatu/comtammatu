import { redirect } from "next/navigation";
import {
  buildAccessDeniedPath,
  INVENTORY_CATALOG_ROLES,
  INVENTORY_CATALOG_VIEW_ROLES,
} from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasAnyPermissionAny } from "@/_lib/permissions";
import {
  CATALOG_MANAGE_PERMISSIONS,
  CATALOG_READ_PERMISSIONS,
} from "../_lib/catalog-permissions";
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
  const { claims } = await loadAuthState();
  const canViewCatalog =
    INVENTORY_CATALOG_VIEW_ROLES.includes(claims.user_role) &&
    (await currentUserHasAnyPermissionAny(CATALOG_READ_PERMISSIONS));
  if (!canViewCatalog) {
    redirect(
      buildAccessDeniedPath("insufficient-permission", {
        from: "/inventory/ingredients",
      }),
    );
  }

  const canManageCatalog =
    INVENTORY_CATALOG_ROLES.includes(claims.user_role) &&
    (await currentUserHasAnyPermissionAny(CATALOG_MANAGE_PERMISSIONS));

  const [result, unitsResult, categoriesResult] = await Promise.all([
    fetchIngredients(2000, undefined, { includeUnits: false }),
    fetchUnitOptions(),
    fetchCategoryOptions(),
  ]);
  if (!result.success || !unitsResult.success || !categoriesResult.success) {
    throw new Error("inventory.ingredients.load_failed");
  }

  const initial = result.data as IngredientRow[];
  const unitOptions: UnitOption[] = unitsResult.data ?? [];
  const categoryOptions: CategoryOption[] = categoriesResult.data ?? [];

  return (
    <IngredientsClient
      initial={initial}
      unitOptions={unitOptions}
      categoryOptions={categoryOptions}
      canManage={canManageCatalog}
    />
  );
}
