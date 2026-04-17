import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims, type StaffRole } from "@comtammatu/shared/auth";
import { fetchIngredients } from "./actions";
import {
  fetchProductionOrders,
  fetchProductionRecipes,
  type ProductionOrderRow,
  type ProductionRecipeRow,
} from "./production-actions";
import type {
  BranchOption,
  FinishedGoodOption,
  IngredientOption,
} from "./production-types";

const PRODUCTION_SURFACE_ROLES = ["super_manager"] as const;

type ProductionSurfaceRole = (typeof PRODUCTION_SURFACE_ROLES)[number];

type InventoryIngredientRow = {
  id: number;
  name: string;
  unit: string;
  item_kind: string;
  is_active: boolean | null;
};

type BranchPreviewRow = {
  id: number;
  name: string;
  branch_kind: string | null;
  is_active: boolean | null;
};

export interface ProductionSurfaceData {
  role: ProductionSurfaceRole;
  canManageCatalog: boolean;
  centralKitchenBranches: BranchOption[];
  ingredients: IngredientOption[];
  finishedGoods: FinishedGoodOption[];
  orders: ProductionOrderRow[];
  recipes: ProductionRecipeRow[];
}

export function canAccessProductionSurface(
  role: StaffRole | null | undefined,
): role is ProductionSurfaceRole {
  return (
    role != null &&
    PRODUCTION_SURFACE_ROLES.includes(role as ProductionSurfaceRole)
  );
}

export async function loadProductionSurfaceData({
  includeRecipes = true,
}: {
  includeRecipes?: boolean;
} = {}): Promise<ProductionSurfaceData> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const claims = extractClaims(session.user.app_metadata);
  if (!claims || !canAccessProductionSurface(claims.user_role)) {
    redirect("/inventory?forbidden=1&reason=insufficient-permission");
  }

  const role = claims.user_role;
  const canManageCatalog = role === "super_manager";

  const recipesPromise = includeRecipes
    ? fetchProductionRecipes()
    : Promise.resolve({
        success: true as const,
        data: [] as ProductionRecipeRow[],
      });

  const [branchesRes, ingredientsRes, ordersRes, recipesRes] =
    await Promise.all([
      supabase
        .from("branches")
        .select("id, name, branch_kind, is_active")
        .eq("tenant_id", claims.tenant_id)
        .eq("is_active", true)
        .order("name"),
      fetchIngredients(),
      fetchProductionOrders(),
      recipesPromise,
    ]);

  const branches = (branchesRes.data ?? []) as BranchPreviewRow[];
  const centralKitchenBranches: BranchOption[] = branches
    .filter((branch) => branch.branch_kind === "central_kitchen")
    .map((branch) => ({
      id: branch.id,
      name: branch.name,
    }));

  const ingredients: IngredientOption[] = (
    ingredientsRes.success && Array.isArray(ingredientsRes.data)
      ? (ingredientsRes.data as InventoryIngredientRow[])
      : []
  )
    .filter((ingredient) => ingredient.is_active !== false)
    .map((ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit,
      item_kind: ingredient.item_kind,
    }));

  const finishedGoods: FinishedGoodOption[] = ingredients
    .filter((ingredient) => ingredient.item_kind === "finished_good")
    .map((ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit,
    }));

  return {
    role,
    canManageCatalog,
    centralKitchenBranches,
    ingredients,
    finishedGoods,
    orders: ordersRes.success ? (ordersRes.data ?? []) : [],
    recipes: recipesRes.success ? (recipesRes.data ?? []) : [],
  };
}
