import { redirect } from "next/navigation";
import { buildAccessDeniedPath, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { currentUserHasAnyPermissionAny } from "@/_lib/permissions";
import { fetchIngredients } from "../actions";
import { IngredientsClient } from "./ingredients-client";
import type { IngredientRow } from "../_lib/types";

const CATALOG_MANAGE_PERMISSIONS = [
  PERMISSION_KEYS.PROCUREMENT_SUPPLIER_MANAGE,
  PERMISSION_KEYS.INVENTORY_PRODUCTION_CREATE,
] as const;

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
