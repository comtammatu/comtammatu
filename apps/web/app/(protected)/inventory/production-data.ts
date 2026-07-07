import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  extractClaimsFromAccessToken,
  PERMISSION_KEYS,
  type JwtClaims,
  type PermissionKey,
} from "@comtammatu/shared/auth";
import { currentUserHasAnyPermissionAny } from "@/_lib/permissions";
import { fetchIngredients, fetchUnitOptions } from "./ingredient-actions";
import { CATALOG_MANAGE_PERMISSIONS } from "./_lib/catalog-permissions";
import {
  canAccessProductionSurface,
  isProductionBranchKind,
  isProductionBranchScopedRole,
  type ProductionOperatorRole,
} from "./_lib/production-roles";
import {
  fetchProductionRuns,
  fetchProductionRecipes,
  type ProductionRunRow,
  type ProductionRecipeRow,
} from "./production-actions";
import type { IngredientUnitRow, UnitOption } from "./_lib/types";
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
  units?: IngredientUnitRow[];
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
  targetBranches: BranchOption[];
  unitOptions: UnitOption[];
  ingredients: IngredientOption[];
  finishedGoods: FinishedGoodOption[];
  runs: ProductionRunRow[];
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

/**
 * `production_manager` claims stay tenant-level (D055 §1: `branch_id` null)
 * so this role's own tenant-wide inventory scope is not pinned to one
 * branch. `routeBranchId` (the embedded operator route's URL segment) is
 * the only branch id available for that role — it must win over
 * `claims.branch_id`, or this gate always returns false for the exact role
 * it exists to check.
 */
export async function hasCurrentProductionBranchAccess(
  supabase: InventorySupabase,
  claims: JwtClaims,
  routeBranchId?: number,
): Promise<boolean> {
  if (!isProductionBranchScopedRole(claims.user_role)) {
    return true;
  }

  const branchId = routeBranchId ?? claims.branch_id;
  if (branchId == null) {
    return false;
  }

  const { data, error } = await supabase
    .from("branches")
    .select("branch_kind")
    .eq("tenant_id", claims.tenant_id)
    .eq("id", branchId)
    .maybeSingle();

  // Production runs at the central kitchen OR at a branch (D068).
  return !error && isProductionBranchKind(data?.branch_kind);
}

export async function loadProductionSurfaceData({
  includeRecipes = true,
  routeBranchId,
}: {
  includeRecipes?: boolean;
  routeBranchId?: number;
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
    currentUserHasAnyPermissionAny(PRODUCTION_OPEN_PERMISSIONS),
    currentUserHasAnyPermissionAny(CATALOG_MANAGE_PERMISSIONS),
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
    hasCurrentProductionBranchAccess(supabase, claims, routeBranchId),
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

    const [branchesRes, ingredientsRes, runsRes, recipesRes, unitOptionsRes] =
    await Promise.all([
      supabase
        .from("branches")
        .select("id, name, branch_kind, is_active")
        .eq("tenant_id", claims.tenant_id)
        .eq("is_active", true)
        .order("name"),
      fetchIngredients(),
      fetchProductionRuns(),
      recipesPromise,
      fetchUnitOptions(),
    ]);

  const branches = (branchesRes.data ?? []) as BranchPreviewRow[];
  // Production sites = central kitchen OR any branch (D068).
  const allProductionBranches: BranchOption[] = branches
    .filter((branch) => isProductionBranchKind(branch.branch_kind))
    .map((branch) => ({
      id: branch.id,
      name: branch.name,
    }));
  const scopedBranchId = claims.branch_id ?? routeBranchId;
  let productionBranches: BranchOption[] = allProductionBranches;
  if (isProductionBranchScopedRole(role) && scopedBranchId != null) {
    productionBranches = productionBranches.filter(
      (branch) => branch.id === scopedBranchId,
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
      units: ingredient.units,
    }));

  const finishedGoods: FinishedGoodOption[] = ingredients
    .filter((ingredient) => ingredient.item_kind === "finished_good")
    .map((ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit,
      units: ingredient.units,
    }));

  return {
    role,
    canManageCatalog,
    canManageRecipes,
    canCreateProduction,
    canConfirmProduction,
    canAdjustStock,
    productionBranches,
    targetBranches: allProductionBranches,
    unitOptions: unitOptionsRes.success ? (unitOptionsRes.data ?? []) : [],
    ingredients,
    finishedGoods,
    runs: runsRes.success ? (runsRes.data ?? []) : [],
    recipes: recipesRes.success ? (recipesRes.data ?? []) : [],
  };
}
