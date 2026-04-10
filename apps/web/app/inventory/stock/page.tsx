import { createClient } from "@comtammatu/database/supabase/server";
import {
  extractClaims,
  getInventoryValueVisibility,
} from "@comtammatu/shared/auth";
import { fetchIngredients } from "../actions";
import { InventoryValuePanel } from "../inventory-value-panel";
import { StockLevelsTable } from "../stock-levels-table";
import type { IngredientRow, BranchOption } from "../page";

export default async function StockPage() {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const claims = session?.user
    ? extractClaims(session.user.app_metadata)
    : null;

  const inventoryValueVisibility = claims
    ? getInventoryValueVisibility(claims.user_role)
    : { system: false, area: false, branch: false };

  const [ingredientsResult, branchesRes] = await Promise.all([
    fetchIngredients(),
    supabase
      .from("branches")
      .select("id, name, is_active")
      .order("is_headquarters", { ascending: false })
      .order("name"),
  ]);

  const ingredients: IngredientRow[] = ingredientsResult.success
    ? (ingredientsResult.data as IngredientRow[])
    : [];

  const branches: BranchOption[] = (branchesRes.data ?? [])
    .filter((b) => b.is_active === true)
    .map((b) => ({ id: b.id, name: b.name, is_active: true }));

  const defaultBranchId = claims?.branch_id ?? branches[0]?.id ?? null;

  return (
    <div className="space-y-4">
      <InventoryValuePanel visibility={inventoryValueVisibility} />
      <StockLevelsTable
        ingredients={ingredients}
        branches={branches}
        defaultBranchId={defaultBranchId}
        showLineValue={inventoryValueVisibility.branch}
      />
    </div>
  );
}
