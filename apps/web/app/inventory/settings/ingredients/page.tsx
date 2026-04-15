import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims, INVENTORY_CATALOG_ROLES } from "@comtammatu/shared/auth";
import { fetchIngredients } from "@/inventory/actions";
import { IngredientsSettingsClient } from "./ingredients-settings-client";
import { PageHeader } from "../../_components/shared";
import type { IngredientRow } from "@/inventory/page";
import { tRoute } from "../../_lib/dictionary";

export default async function IngredientsSettingsPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = session?.user
    ? extractClaims(session.user.app_metadata)
    : null;

  const ingredientsResult = await fetchIngredients();
  const ingredients: IngredientRow[] = ingredientsResult.success
    ? (ingredientsResult.data as IngredientRow[])
    : [];

  const canManageIngredientCatalog = claims
    ? INVENTORY_CATALOG_ROLES.includes(claims.user_role)
    : false;

  return (
    <div className="space-y-6">
      <PageHeader
        title={tRoute("/inventory/settings/ingredients", "heading")}
      />
      <IngredientsSettingsClient
        ingredients={ingredients}
        canManageCatalog={canManageIngredientCatalog}
      />
    </div>
  );
}
