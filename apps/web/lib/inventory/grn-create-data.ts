import "server-only";

import { notFound, redirect } from "next/navigation";
import { PERMISSION_KEYS, PROCUREMENT_ROLES } from "@comtammatu/shared/auth";
import { normalizeInventoryLocationNameVi } from "@comtammatu/shared/labels";
import { loadAuthState, probePermission } from "@/_lib/auth";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import { fetchProcurementBranches } from "@/(protected)/inventory/_lib/procurement-branches";
import { loadActiveGrnDraft } from "@/(protected)/inventory/grn-actions";
import type { IngredientUnitRow } from "@lib/inventory/types";
import { getIngredientUnitDisplayName } from "@/(protected)/inventory/_lib/unit-display";
import type {
  GrnCreateIngredient,
  GrnCreatePageData,
  GrnCreateSupplierOption,
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

type IngredientJoinRow = {
  id: number;
  name: string;
  sku: string | null;
  category: string | null;
  receipt_unit_id: number | null;
  issue_unit_id: number | null;
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

type SupplierItemJoinRow = {
  ingredient_id: number;
  is_preferred: boolean | null;
  suppliers: { id: number; name: string } | { id: number; name: string }[] | null;
};

function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function loadGrnCreatePageData({
  queryBranchId,
  routeBranchId,
  grnBasePath,
}: {
  queryBranchId?: string | string[];
  routeBranchId?: number;
  fallbackPath: string;
  grnBasePath: string;
}): Promise<GrnCreatePageData> {
  const auth = await loadAuthState();
  const { supabase, claims } = auth;
  if (!PROCUREMENT_ROLES.includes(claims.user_role)) {
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

  const [ingredientsRes, locationsRes, supplierItemsRes] = await Promise.all([
    supabase
      .from("ingredients")
      .select(
        "id, name, sku, category, receipt_unit_id, issue_unit_id, ingredient_units!ingredient_units_ingredient_tenant_fkey(id, unit_id, to_base_factor, is_base, is_active, sort_order, units!ingredient_units_unit_tenant_fkey(code, name))",
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
    supabase
      .from("supplier_items")
      .select("ingredient_id, is_preferred, suppliers ( id, name )")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .limit(5000),
  ]);

  if (ingredientsRes.error || supplierItemsRes.error) {
    throw new Error("inventory.supplier_items.load_failed");
  }

  const branches = await fetchProcurementBranches(supabase, claims.tenant_id);
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
      return (
        procurementBranchIds.has(location.branch_id) &&
        location.location_kind === "warehouse"
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

  const suppliersByIngredient = new Map<number, GrnCreateSupplierOption[]>();
  for (const item of (supplierItemsRes.data ?? []) as SupplierItemJoinRow[]) {
    const supplier = relatedOne(item.suppliers);
    if (!supplier) continue;
    const existing = suppliersByIngredient.get(item.ingredient_id) ?? [];
    if (!existing.some((row) => row.id === supplier.id)) {
      existing.push({
        id: supplier.id,
        name: supplier.name,
        isPreferred: item.is_preferred === true,
      });
      suppliersByIngredient.set(item.ingredient_id, existing);
    } else if (item.is_preferred === true) {
      const row = existing.find((entry) => entry.id === supplier.id);
      if (row) row.isPreferred = true;
    }
  }

  const ingredients: GrnCreateIngredient[] = (
    (ingredientsRes.data ?? []) as IngredientJoinRow[]
  )
    .filter((ingredient) => (suppliersByIngredient.get(ingredient.id)?.length ?? 0) > 0)
    .map(({ ingredient_units, ...ingredient }) => {
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
      const suppliers = (suppliersByIngredient.get(ingredient.id) ?? []).toSorted(
        (left, right) => {
          if (left.isPreferred !== right.isPreferred) {
            return left.isPreferred ? -1 : 1;
          }
          return left.name.localeCompare(right.name, "vi");
        },
      );
      return {
        ...ingredient,
        unit: units.find((unit) => unit.is_base)?.unit_code ?? "",
        units,
        suppliers,
      };
    });

  let recentLines: GrnCreatePageData["recentLines"] = [];
  if (defaultBranchId != null) {
    const recentGrnRes = await supabase
      .from("goods_received_notes")
      .select("id")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", defaultBranchId)
      .eq("status", "confirmed")
      .order("received_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentGrnRes.data?.id) {
      const recentItemsRes = await supabase
        .from("grn_items")
        .select(
          "ingredient_id, received_quantity, entry_unit_id, supplier_id, suppliers ( id, name )",
        )
        .eq("tenant_id", claims.tenant_id)
        .eq("grn_id", recentGrnRes.data.id)
        .gt("received_quantity", 0)
        .order("id", { ascending: true });
      recentLines = (recentItemsRes.data ?? []).flatMap((line) => {
        const ingredient = ingredients.find(
          (item) => item.id === line.ingredient_id,
        );
        if (!ingredient) return [];
        const supplier = relatedOne(line.suppliers);
        if (!supplier) return [];
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
            supplierId: supplier.id,
            supplierName: supplier.name,
          },
        ];
      });
    }
  }

  if (defaultBranchId != null) {
    const draftRes = await loadActiveGrnDraft({
      branchId: defaultBranchId,
    });
    const draftRow = (draftRes.success ? draftRes.data : null) as {
      id: number;
    } | null;
    if (draftRow?.id) {
      redirect(`${grnBasePath}/${draftRow.id}`);
    }
  }

  return {
    branchId: defaultBranchId,
    procurementBranches: branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
    })),
    locationOptions,
    canSwitchBranch: routeBranchId == null,
    ingredients,
    recentLines,
    activeDraft: null,
  };
}
