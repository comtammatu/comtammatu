import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { InventoryHeader } from "../_components/inventory-header";
import { redirect } from "next/navigation";
import { fetchIngredients } from "../actions";
import {
  fetchProductionOrders,
  fetchProductionRecipes,
  type ProductionOrderRow,
  type ProductionRecipeRow,
} from "../production-actions";
import { ProductionHubClient } from "../production-client";
type InventoryIngredientRow = {
  id: number;
  name: string;
  unit: string;
  item_kind: string;
};

type BranchPreviewRow = {
  id: number;
  name: string;
  branch_kind: string | null;
  is_active: boolean | null;
};

export default async function ProductionPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const claims = session?.user
    ? extractClaims(session.user.app_metadata)
    : null;

  const role = claims?.user_role;
  if (!role || !["owner", "super_manager", "branch_manager", "warehouse_manager", "production_manager"].includes(role)) {
    redirect("/inventory?forbidden=1&reason=insufficient-permission");
  }

  const branchesQuery = supabase
    .from("branches")
    .select("id, name, branch_kind, is_active")
    .eq("tenant_id", claims?.tenant_id ?? 0)
    .eq("is_active", true)
    .order("name");

  const [branchesRes, ingredientsRes, ordersRes, recipesRes] =
    await Promise.all([
      branchesQuery,
      fetchIngredients(),
      fetchProductionOrders(),
      fetchProductionRecipes(),
    ]);
  const branches = (branchesRes.data ?? []) as BranchPreviewRow[];

  const centralKitchenBranches = branches
    .filter((branch) => branch.branch_kind === "central_kitchen")
    .map((branch) => ({
      id: branch.id,
      name: branch.name,
    }));

  // branch_manager sees only their own central_kitchen; super_manager/owner see all
  const visibleBranches =
    role === "branch_manager"
      ? centralKitchenBranches.filter((b) => b.id === claims!.branch_id)
      : centralKitchenBranches;

  // branch_manager not assigned to a central_kitchen → no access
  if (role === "branch_manager" && visibleBranches.length === 0) {
    redirect("/inventory?forbidden=1&reason=insufficient-permission");
  }

  const allIngredients =
    ingredientsRes.success && Array.isArray(ingredientsRes.data)
      ? (ingredientsRes.data as InventoryIngredientRow[])
      : [];

  const finishedGoods = allIngredients
    .filter((ingredient) => ingredient.item_kind === "finished_good")
    .map((ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit,
    }));

  const orders: ProductionOrderRow[] = ordersRes.success
    ? (ordersRes.data ?? [])
    : [];

  const recipes: ProductionRecipeRow[] = recipesRes.success
    ? (recipesRes.data ?? [])
    : [];

  return (
    <>
      <InventoryHeader title="Bếp trung tâm" />
      <div className="flex-1 overflow-auto p-4">
      <div className="mx-auto max-w-7xl space-y-6">
      <ProductionHubClient
        centralKitchenBranches={visibleBranches}
        ingredients={allIngredients.map((ingredient) => ({
          id: ingredient.id,
          name: ingredient.name,
          unit: ingredient.unit,
          item_kind: ingredient.item_kind,
        }))}
        finishedGoods={finishedGoods}
        orders={orders}
        recipes={recipes}
      />
    </div>
    </div>
    </>
  );
}
