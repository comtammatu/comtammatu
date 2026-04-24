import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  extractClaimsFromAccessToken,
  PERMISSION_KEYS,
  type JwtClaims,
  type PermissionKey,
  type StaffRole,
} from "@comtammatu/shared/auth";
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

const PRODUCTION_SURFACE_ROLES = [
  "owner",
  "super_manager",
  "production_manager",
] as const;

export const PRODUCTION_OPEN_PERMISSIONS = [
  PERMISSION_KEYS.INVENTORY_PRODUCTION_CREATE,
  PERMISSION_KEYS.INVENTORY_PRODUCTION_CONFIRM,
  PERMISSION_KEYS.MENU_WRITE,
] as const;

const CATALOG_MANAGE_PERMISSIONS = [
  PERMISSION_KEYS.PROCUREMENT_SUPPLIER_MANAGE,
  PERMISSION_KEYS.INVENTORY_PRODUCTION_CREATE,
] as const;

const PRODUCTION_BRANCH_SCOPED_ROLES = ["production_manager"] as const;

type ProductionSurfaceRole = (typeof PRODUCTION_SURFACE_ROLES)[number];
type ProductionBranchScopedRole =
  (typeof PRODUCTION_BRANCH_SCOPED_ROLES)[number];
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
  role: ProductionSurfaceRole;
  canManageCatalog: boolean;
  canManageRecipes: boolean;
  canCreateProduction: boolean;
  canConfirmProduction: boolean;
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

export function isProductionBranchScopedRole(
  role: StaffRole | null | undefined,
): role is ProductionBranchScopedRole {
  return (
    role != null &&
    PRODUCTION_BRANCH_SCOPED_ROLES.includes(role as ProductionBranchScopedRole)
  );
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

  return !error && data?.branch_kind === "central_kitchen";
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
  let centralKitchenBranches: BranchOption[] = branches
    .filter((branch) => branch.branch_kind === "central_kitchen")
    .map((branch) => ({
      id: branch.id,
      name: branch.name,
    }));
  if (isProductionBranchScopedRole(role) && claims.branch_id != null) {
    centralKitchenBranches = centralKitchenBranches.filter(
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
    centralKitchenBranches,
    ingredients,
    finishedGoods,
    orders: ordersRes.success ? (ordersRes.data ?? []) : [],
    recipes: recipesRes.success ? (recipesRes.data ?? []) : [],
  };
}
