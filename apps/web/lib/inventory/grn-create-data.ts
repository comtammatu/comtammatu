import "server-only";

import { notFound, redirect } from "next/navigation";
import {
  canAccess,
  PERMISSION_KEYS,
  PROCUREMENT_ROLES,
} from "@comtammatu/shared/auth";
import { normalizeInventoryLocationNameVi } from "@comtammatu/shared/labels";
import { loadAuthState, probePermission } from "@/_lib/auth";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import { fetchProcurementBranches } from "@/(protected)/inventory/_lib/procurement-branches";
import { isStockBearingLocationKind } from "@/(protected)/inventory/_lib/stock-bearing-locations";
import {
  fetchGrnDetail,
  loadActiveGrnDraft,
} from "@/(protected)/inventory/grn-actions";
import type { IngredientUnitRow } from "@/(protected)/inventory/_lib/types";
import { getIngredientUnitDisplayName } from "@/(protected)/inventory/_lib/unit-display";
import type {
  GrnCreateIngredient,
  GrnCreatePageData,
  GrnCreateServerDraftLine,
} from "./grn-create-model";

type IngredientUnitJoinRow = {
  id: number;
  unit_id: number;
  to_base_factor: number | string;
  is_base: boolean;
  is_active: boolean;
  sort_order: number;
  units: { code: string; name: string | null } | null;
};

type IngredientJoinRow = Omit<GrnCreateIngredient, "units"> & {
  ingredient_units: IngredientUnitJoinRow[] | null;
};

type InventoryLocationRow = {
  id: number;
  name: string;
  branch_id: number;
  location_kind: string | null;
  is_default_receive: boolean | null;
  is_default_consumption: boolean | null;
  is_active: boolean | null;
};

export async function loadGrnCreatePageData({
  supplierId,
  queryBranchId,
  routeBranchId,
  fallbackPath,
}: {
  supplierId: number;
  queryBranchId?: string | string[];
  routeBranchId?: number;
  fallbackPath: string;
}): Promise<GrnCreatePageData> {
  if (!Number.isFinite(supplierId) || supplierId <= 0) {
    redirect(fallbackPath);
  }

  const auth = await loadAuthState();
  const { supabase, claims } = auth;
  if (
    !PROCUREMENT_ROLES.includes(claims.user_role) ||
    !canAccess(claims.user_role, "inventory_procurement")
  ) {
    redirect("/access-denied?reason=insufficient-permission");
  }

  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranchId,
  });
  if (scope.outOfScope) notFound();

  const canCreate = await probePermission(
    auth,
    PERMISSION_KEYS.PROCUREMENT_GRN_CREATE,
    scope.selectedBranchId,
  );
  if (!canCreate) redirect("/access-denied?reason=insufficient-permission");

  const [supplierRes, ingredientsRes, locationsRes] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("id", supplierId)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle(),
    supabase
      .from("ingredients")
      .select(
        "id, name, sku, unit_cost, category, ingredient_units!ingredient_units_ingredient_tenant_fkey(id, unit_id, to_base_factor, is_base, is_active, sort_order, units!ingredient_units_unit_tenant_fkey(code, name))",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("name")
      .limit(500),
    supabase
      .from("inventory_locations")
      .select(
        "id, name, branch_id, location_kind, is_default_receive, is_default_consumption, is_active",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  if (!supplierRes.data) redirect(fallbackPath);

  const [branches, canConfirm] = await Promise.all([
    fetchProcurementBranches(supabase, claims.tenant_id),
    probePermission(
      auth,
      PERMISSION_KEYS.PROCUREMENT_GRN_CONFIRM,
      scope.selectedBranchId,
    ),
  ]);
  const defaultBranchId =
    scope.selectedBranchId != null &&
    branches.some((branch) => branch.id === scope.selectedBranchId)
      ? scope.selectedBranchId
      : claims.branch_id &&
          branches.some((branch) => branch.id === claims.branch_id)
        ? claims.branch_id
        : (branches[0]?.id ?? null);
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const procurementBranchIds = new Set(branches.map((branch) => branch.id));
  const locationOptions = ((locationsRes.data ?? []) as InventoryLocationRow[])
    .filter((location) => {
      const branch = branchById.get(location.branch_id);
      return (
        procurementBranchIds.has(location.branch_id) &&
        isStockBearingLocationKind({
          siteKind: branch?.branch_kind,
          locationKind: location.location_kind,
        })
      );
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

  const ingredients = ((ingredientsRes.data ?? []) as IngredientJoinRow[]).map(
    ({ ingredient_units, ...ingredient }) => {
      const units: IngredientUnitRow[] = (ingredient_units ?? [])
        .filter((unit) => unit.is_active)
        .map((unit) => ({
          id: unit.id,
          unit_id: unit.unit_id,
          unit_code: unit.units?.code ?? "",
          unit_name: unit.units?.name ?? unit.units?.code ?? "",
          to_base_factor: Number(unit.to_base_factor ?? 1),
          is_base: unit.is_base,
          is_active: unit.is_active,
          sort_order: unit.sort_order,
        }))
        .sort((left, right) => left.sort_order - right.sort_order);
      return {
        ...ingredient,
        unit: units.find((unit) => unit.is_base)?.unit_code ?? "",
        units,
      };
    },
  );

  let recentLines: GrnCreatePageData["recentLines"] = [];
  if (defaultBranchId != null) {
    const recentGrnRes = await supabase
      .from("goods_received_notes")
      .select("id")
      .eq("tenant_id", claims.tenant_id)
      .eq("supplier_id", supplierId)
      .eq("branch_id", defaultBranchId)
      .eq("status", "confirmed")
      .order("received_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentGrnRes.data?.id) {
      const recentItemsRes = await supabase
        .from("grn_items")
        .select("ingredient_id, received_quantity, entry_unit_id")
        .eq("tenant_id", claims.tenant_id)
        .eq("grn_id", recentGrnRes.data.id)
        .gt("received_quantity", 0)
        .order("id", { ascending: true });
      recentLines = (recentItemsRes.data ?? []).flatMap((line) => {
        const ingredient = ingredients.find(
          (item) => item.id === line.ingredient_id,
        );
        if (!ingredient) return [];
        return [
          {
            ingredientId: ingredient.id,
            ingredientName: ingredient.name,
            unit: getIngredientUnitDisplayName(
              ingredient.units,
              line.entry_unit_id,
              ingredient.unit,
            ),
            entryUnitId: line.entry_unit_id,
            quantity: Number(line.received_quantity),
            unitCost: null,
          },
        ];
      });
    }
  }

  let existingDraft: {
    id: number;
    lines: GrnCreateServerDraftLine[];
  } | null = null;
  const draftRes = await loadActiveGrnDraft({
    supplierId,
    branchId: defaultBranchId ?? undefined,
  });
  const draftRow = (draftRes.success ? draftRes.data : null) as {
    id: number;
    branch_id: number;
    location_id: number | null;
  } | null;
  if (draftRow?.id) {
    const detailRes = await fetchGrnDetail(draftRow.id);
    if (detailRes.success && detailRes.data) {
      const detail = detailRes.data as {
        grn: { id: number };
        lines: Array<{
          id: number;
          ingredient_id: number;
          received_quantity: number | string;
          unit: string;
          entry_unit_id: number | null;
          unit_cost: number | string;
          ingredients: { name: string } | null;
        }>;
      };
      existingDraft = {
        id: detail.grn.id,
        lines: detail.lines.map((line) => ({
          lineId: line.id,
          ingredientId: line.ingredient_id,
          ingredientName: line.ingredients?.name ?? "",
          unit: getIngredientUnitDisplayName(
            ingredients.find(
              (ingredient) => ingredient.id === line.ingredient_id,
            )?.units,
            line.entry_unit_id,
            line.unit,
          ),
          entryUnitId: line.entry_unit_id,
          quantity: Number(line.received_quantity ?? 0),
          unitCost: Number(line.unit_cost ?? 0),
        })),
      };
    }
  }

  const initialBranchId = draftRow?.branch_id ?? defaultBranchId;
  const initialLocationId = draftRow?.location_id ?? null;

  return {
    supplier: { id: supplierRes.data.id, name: supplierRes.data.name },
    branchId: initialBranchId,
    procurementBranches: branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
    })),
    locationOptions,
    initialLocationId,
    canSwitchBranch: routeBranchId == null,
    ingredients,
    recentLines,
    existingDraft,
    canConfirm,
  };
}
