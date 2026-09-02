import "server-only";

import { notFound } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermission } from "@/_lib/permissions";
import { getBranchSiteDisplayName } from "@/(protected)/inventory/_lib/branch-site-labels";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import { getWasteCapStatus } from "@/(protected)/inventory/waste-actions";
import type { WasteFormContext } from "./waste-create-model";

const FALLBACK_CAP_STATUS: WasteFormContext["capStatus"] = {
  shiftKey: "",
  requiresReview: false,
};

export async function loadBranchWasteCreateData(routeBranchId: number) {
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
  });
  if (scope.outOfScope || scope.selectedBranchId !== routeBranchId) notFound();

  const branch = scope.allowedBranches.find(
    (item) => item.id === routeBranchId,
  );
  const branchName = branch
    ? getBranchSiteDisplayName(branch)
    : UNKNOWN_LABEL_VI;
  const canCreateWaste = await currentUserHasPermission(
    routeBranchId,
    PERMISSION_KEYS.INVENTORY_WRITEOFF,
  );

  if (!canCreateWaste) {
    return {
      branchId: routeBranchId,
      branchName,
      canCreateWaste,
      loadFailed: false,
      context: null,
    };
  }

  const [locationsRes, ingredientsRes, capRes] = await Promise.all([
    supabase
      .from("inventory_locations")
      .select("id, name, location_kind")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", routeBranchId)
      .eq("is_active", true)
      .eq("location_kind", "warehouse")
      .order("sort_order", { ascending: true }),
    supabase
      .from("ingredients")
      .select(
        "id, name, ingredient_units!ingredient_units_ingredient_tenant_fkey(unit_id, to_base_factor, is_base, sort_order, units!ingredient_units_unit_tenant_fkey(code, name))",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    getWasteCapStatus(routeBranchId),
  ]);
  const { data: stockLevels, error: stockLevelsError } = await supabase
    .from("stock_levels")
    .select("ingredient_id, location_id, current_quantity")
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", routeBranchId);

  if (locationsRes.error || ingredientsRes.error || stockLevelsError) {
    return {
      branchId: routeBranchId,
      branchName,
      canCreateWaste,
      loadFailed: true,
      context: null,
    };
  }

  const context: WasteFormContext = {
    tenantId: claims.tenant_id,
    branch: {
      id: routeBranchId,
      name: branchName,
      kind: "branch",
    },
    locations: (locationsRes.data ?? []).map((location) => ({
      id: location.id,
      name: location.name,
      kind: location.location_kind ?? "warehouse",
    })),
    ingredients: (ingredientsRes.data ?? []).map((ingredient) => {
      const issueUnits = (ingredient.ingredient_units ?? [])
        .filter((unit) => (unit.units?.code ?? "") !== "")
        .sort((left, right) => {
          if (left.is_base !== right.is_base) return left.is_base ? -1 : 1;
          return left.sort_order - right.sort_order;
        })
        .map((unit) => ({
          unitId: unit.unit_id,
          code: unit.units?.code ?? "",
          label: unit.units?.name ?? unit.units?.code ?? "",
          isBase: unit.is_base,
          toBaseFactor: Number(unit.to_base_factor ?? 1),
        }));
      const ingredientStockLevels = (stockLevels ?? [])
        .filter((level) => level.ingredient_id === ingredient.id)
        .map((level) => ({
          locationId: level.location_id,
          quantity: Number(level.current_quantity ?? 0),
        }));

      return {
        id: ingredient.id,
        name: ingredient.name,
        unit:
          issueUnits.find((unit) => unit.isBase)?.label ??
          issueUnits[0]?.label ??
          "kg",
        issueUnits,
        stockLevels: ingredientStockLevels,
      };
    }),
    capStatus:
      capRes.success && capRes.data ? capRes.data : FALLBACK_CAP_STATUS,
  };

  return {
    branchId: routeBranchId,
    branchName,
    canCreateWaste,
    loadFailed: false,
    context,
  };
}
