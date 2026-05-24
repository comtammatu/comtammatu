import { redirect } from "next/navigation";
import { buildAccessDeniedPath } from "@comtammatu/shared/auth";
import { currentUserHasAnyPermissionAny } from "@/_lib/permissions";
import { CATALOG_MANAGE_PERMISSIONS } from "../_lib/catalog-permissions";
import { fetchIngredients } from "../actions";
import { IngredientsClient } from "./ingredients-client";
import type { IngredientRow } from "../_lib/types";

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

  const result = await fetchIngredients();

  const initial: IngredientRow[] = result.success
    ? (result.data as IngredientRow[])
    : [];

  return <IngredientsClient initial={initial} />;
}
