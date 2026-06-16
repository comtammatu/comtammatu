import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  extractClaimsFromAccessToken,
  PERMISSION_KEYS,
  type JwtClaims,
  type PermissionKey,
} from "@comtammatu/shared/auth";
import { fetchIngredients } from "./ingredient-actions";
import { CATALOG_MANAGE_PERMISSIONS } from "./_lib/catalog-permissions";
import {
  canAccessProductionSurface,
  isProductionBranchScopedRole,
  type ProductionOperatorRole,
} from "./_lib/production-roles";
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

export { canAccessProductionSurface };

export const PRODUCTION_OPEN_PERMISSIONS = [
  PERMISSION_KEYS.INVENTORY_PRODUCTION_CREATE,
  PERMISSION_KEYS.INVENTORY_PRODUCTION_CONFIRM,
  PERMISSION_KEYS.MENU_WRITE,
] as const;

type InventorySupabase = Awaited<ReturnType<typeof createClient>>;

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
  role: ProductionOperatorRole;
  canManageCatalog: boolean;
  canManageRecipes: boolean;
  canCreateProduction: boolean;
  canConfirmProduction: boolean;
  canAdjustStock: boolean;
  productionBranches: BranchOption[];
  ingredients: IngredientOption[];
  finishedGoods: FinishedGoodOption[];
  orders: ProductionOrderRow[];
  recipes: ProductionRecipeRow[];
}

async function currentUserHasAnyPermission(
  supabase: InventorySupabase,
  key: PermissionKey,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_permission_any", {
    p_key: key,
  });
  return !error && data === true;
}

async function currentUserHasOneOfPermissions(
  supabase: InventorySupabase,
  keys: readonly PermissionKey[],
): Promise<boolean> {
  for (const key of keys) {
    if (await currentUserHasAnyPermission(supabase, key)) {
      return true;
    }
  }
  return false;
}

export async function hasCurrentProductionBranchAccess(
  supabase: InventorySupabase,
  claims: JwtClaims,
): Promise<boolean> {
  if (!isProductionBranchScopedRole(claims.user_role)) {
    return true;
  }

  if (claims.branch_id == null) {
    return false;
  }

  const { data, error } = await supabase
    .from("branches")
    .select("branch_kind")
    .eq("tenant_id", claims.tenant_id)
    .eq("id", claims.branch_id)
    .maybeSingle();

  return !error && data?.branch_kind === "branch";
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

  const claims = extractClaimsFromAccessToken(session?.access_token);
  if (!claims || !canAccessProductionSurface(claims.user_role)) {
    redirect("/access-denied?reason=insufficient-permission");
  }

  const role = claims.user_role;
  const [
    canOpenProduction,
    canManageCatalog,
    canManageRecipes,
    canCreateProduction,
    canConfirmProduction,
    canAdjustStock,
    hasBranchAccess,
  ] = await Promise.all([
    currentUserHasOneOfPermissions(supabase, PRODUCTION_OPEN_PERMISSIONS),
    currentUserHasOneOfPermissions(supabase, CATALOG_MANAGE_PERMISSIONS),
    currentUserHasAnyPermission(supabase, PERMISSION_KEYS.MENU_WRITE),
    currentUserHasAnyPermission(
      supabase,
      PERMISSION_KEYS.INVENTORY_PRODUCTION_CREATE,
    ),
    currentUserHasAnyPermission(
      supabase,
      PERMISSION_KEYS.INVENTORY_PRODUCTION_CONFIRM,
    ),
    currentUserHasAnyPermission(supabase, PERMISSION_KEYS.INVENTORY_WRITE),
    hasCurrentProductionBranchAccess(supabase, claims),
  ]);

  if (!canOpenProduction || !hasBranchAccess) {
    redirect("/access-denied?reason=insufficient-permission");
  }

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
  let productionBranches: BranchOption[] = branches
    .filter((branch) => branch.branch_kind === "branch")
    .map((branch) => ({
      id: branch.id,
      name: branch.name,
    }));
  if (isProductionBranchScopedRole(role) && claims.branch_id != null) {
    productionBranches = productionBranches.filter(
      (branch) => branch.id === claims.branch_id,
    );
  }

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
    canManageRecipes,
    canCreateProduction,
    canConfirmProduction,
    canAdjustStock,
    productionBranches,
    ingredients,
    finishedGoods,
    orders: ordersRes.success ? (ordersRes.data ?? []) : [],
    recipes: recipesRes.success ? (recipesRes.data ?? []) : [],
  };
}
