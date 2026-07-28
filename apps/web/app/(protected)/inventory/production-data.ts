import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  extractClaimsFromAccessToken,
  PERMISSION_KEYS,
  type JwtClaims,
  type PermissionKey,
} from "@comtammatu/shared/auth";
import { normalizeInventoryLocationNameVi } from "@comtammatu/shared/labels";
import { currentUserHasAnyPermissionAny } from "@/_lib/permissions";
import { messages } from "@lib/messages";
import { fetchIngredients, fetchUnitOptions } from "./ingredient-actions";
import { CATALOG_MANAGE_PERMISSIONS } from "./_lib/catalog-permissions";
import {
  canAccessProductionSurface,
  canManageProductionRecipes,
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
import type { IngredientUnitRow, UnitOption } from "@lib/inventory/types";
import type {
  BranchOption,
  FinishedGoodOption,
  IngredientOption,
  InventoryLocationOption,
} from "./production-types";

export { canAccessProductionSurface };

export const PRODUCTION_OPEN_PERMISSIONS = [
  PERMISSION_KEYS.INVENTORY_PRODUCTION_CREATE,
  PERMISSION_KEYS.INVENTORY_PRODUCTION_CONFIRM,
  PERMISSION_KEYS.MENU_WRITE,
] as const;

const PRODUCTION_RECIPE_MANAGE_PERMISSIONS = [
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

type InventoryLocationPreviewRow = {
  id: number;
  name: string;
  branch_id: number;
  location_kind: string | null;
  is_default_receive: boolean | null;
  is_default_consumption: boolean | null;
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
  locations: InventoryLocationOption[];
  unitOptions: UnitOption[];
  ingredients: IngredientOption[];
  finishedGoods: FinishedGoodOption[];
  runs: ProductionRunRow[];
  recipes: ProductionRecipeRow[];
  recipeLoadError: string | null;
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
 * `branch_manager` claims are always pinned to a branch, but embedded
 * operator routes pass their own `routeBranchId` (URL segment) which must
 * win over a stale `claims.branch_id` when the two diverge.
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

  // Production runs at the central kitchen or at an operating branch.
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
  const isOwner = role === "owner";
  const [
    canOpenProduction,
    canManageCatalog,
    hasRecipeManagePermission,
    canCreateProduction,
    canConfirmProduction,
    canAdjustStock,
    hasBranchAccess,
  ] = await Promise.all([
    isOwner
      ? Promise.resolve(true)
      : currentUserHasAnyPermissionAny(PRODUCTION_OPEN_PERMISSIONS),
    currentUserHasAnyPermissionAny(CATALOG_MANAGE_PERMISSIONS),
    currentUserHasAnyPermissionAny(PRODUCTION_RECIPE_MANAGE_PERMISSIONS),
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

  const [
    branchesRes,
    locationsRes,
    ingredientsRes,
    runsRes,
    recipesRes,
    unitOptionsRes,
  ] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, branch_kind, is_active")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("inventory_locations")
      .select(
        "id, name, branch_id, location_kind, is_default_receive, is_default_consumption, is_active",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    fetchIngredients(),
    fetchProductionRuns(),
    recipesPromise,
    fetchUnitOptions(),
  ]);

  const branches = (branchesRes.data ?? []) as BranchPreviewRow[];
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  // Production site choices must remain production-compatible locations only.
  const productionBranchesList: BranchOption[] = branches
    .filter((branch) => isProductionBranchKind(branch.branch_kind))
    .map((branch) => ({
      id: branch.id,
      name: branch.name,
      branchKind: branch.branch_kind,
    }));
  const allTargetBranches: BranchOption[] = branches.map((branch) => ({
    id: branch.id,
    name: branch.name,
    branchKind: branch.branch_kind,
  }));
  const scopedBranchId = claims.branch_id ?? routeBranchId;
  let productionBranches: BranchOption[] = productionBranchesList;
  let targetBranches: BranchOption[] = allTargetBranches;
  if (isProductionBranchScopedRole(role) && scopedBranchId != null) {
    productionBranches = productionBranches.filter(
      (branch) => branch.id === scopedBranchId,
    );
    targetBranches = targetBranches.filter(
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

  const locations: InventoryLocationOption[] = (
    (locationsRes.data ?? []) as InventoryLocationPreviewRow[]
  )
    .filter((location) => {
      if (location.is_active === false) return false;
      const branchKind = branchById.get(location.branch_id)?.branch_kind;
      return branchKind === "central_kitchen"
        ? location.location_kind === "warehouse" ||
            location.location_kind === "production_storage"
        : location.location_kind === "warehouse";
    })
    .map((location) => {
      const branch = branchById.get(location.branch_id);
      return {
        id: location.id,
        name: normalizeInventoryLocationNameVi(location.name),
        branchId: location.branch_id,
        branchName: branch?.name ?? "Chi nhánh",
        branchKind: branch?.branch_kind ?? null,
        kind: location.location_kind,
        isDefaultReceive: location.is_default_receive === true,
        isDefaultConsumption: location.is_default_consumption === true,
      };
    });

  return {
    role,
    canManageCatalog,
    canManageRecipes:
      canManageProductionRecipes(role) && hasRecipeManagePermission,
    canCreateProduction,
    canConfirmProduction,
    canAdjustStock,
    productionBranches,
    targetBranches,
    locations,
    unitOptions: unitOptionsRes.success ? (unitOptionsRes.data ?? []) : [],
    ingredients,
    finishedGoods,
    runs: runsRes.success ? (runsRes.data ?? []) : [],
    recipes: recipesRes.success ? (recipesRes.data ?? []) : [],
    recipeLoadError: recipesRes.success
      ? null
      : (recipesRes.error ?? messages.inventory.productionRecipes.loadFailed),
  };
}
