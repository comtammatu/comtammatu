import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { fetchIngredients } from "@/admin/inventory/actions";
import { IngredientsSettingsClient } from "./ingredients-settings-client";
import { PageHeader } from "../../_components/shared";
import type { IngredientRow } from "@/admin/inventory/page";

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

  const canManageIngredientCatalog = claims?.user_role === "super_manager";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nguyên liệu"
        description="Quản lý danh mục nguyên liệu"
      />
      <IngredientsSettingsClient
        ingredients={ingredients}
        canManageCatalog={canManageIngredientCatalog}
      />
    </div>
  );
}
