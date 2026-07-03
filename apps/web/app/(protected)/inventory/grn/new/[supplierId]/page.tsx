import { notFound, redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import {
  canAccess,
  PROCUREMENT_ROLES,
} from "@comtammatu/shared/auth";
import { resolveInventoryListScope } from "../../../_lib/inventory-scope";
import { fetchProcurementBranches } from "../../../_lib/procurement-branches";
import { fetchGrnDetail, loadActiveGrnDraft } from "../../../grn-actions";
import type { GrnDraftLine } from "../../../_lib/grn-draft";
import type { IngredientUnitRow } from "../../../_lib/types";
import { GrnCreateClient } from "./grn-create-client";

type IngredientUnitJoinRow = {
  id: number;
  unit_id: number;
  to_base_factor: number | string;
  is_base: boolean;
  allow_purchase: boolean;
  allow_issue: boolean;
  allow_production: boolean;
  sort_order: number;
  units: { code: string } | null;
};

type Ingredient = {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  purchase_unit: string | null;
  unit_cost: number | null;
  category: string | null;
  units?: IngredientUnitRow[];
};

interface GrnCreatePageContentProps {
  supplierId: number;
  searchParams?: Promise<{ branchId?: string | string[] }>;
  routeBranchId?: number;
  basePath?: string;
  grnBasePath?: string;
  embedded?: boolean;
}

export async function GrnCreatePageContent({
  supplierId,
  searchParams,
  routeBranchId,
  basePath = "/inventory/grn/new",
  grnBasePath = "/inventory/grn",
  embedded = false,
}: GrnCreatePageContentProps) {
  if (!Number.isFinite(supplierId) || supplierId <= 0) {
    redirect(basePath);
  }

  const queryParams = searchParams ? await searchParams : {};
  const { supabase, claims } = await loadAuthState();
  if (
    !PROCUREMENT_ROLES.includes(claims.user_role) ||
    !canAccess(claims.user_role, "inventory_procurement")
  ) {
    redirect("/access-denied?reason=insufficient-permission");
  }

  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranchId: queryParams.branchId,
  });
  if (scope.outOfScope) notFound();

  const [supplierRes, ingredientsRes] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("id", supplierId)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle(),
    supabase
      .from("ingredients")
      .select(
        "id, name, sku, unit, purchase_unit, unit_cost, category, ingredient_units!ingredient_units_ingredient_tenant_fkey(id, unit_id, to_base_factor, is_base, allow_purchase, allow_issue, allow_production, sort_order, units!ingredient_units_unit_tenant_fkey(code))",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("name")
      .limit(500),
  ]);

  if (!supplierRes.data) redirect(basePath);

  const branches = await fetchProcurementBranches(supabase, claims.tenant_id);
  const defaultBranchId =
    scope.selectedBranchId != null &&
    branches.some((b) => b.id === scope.selectedBranchId)
      ? scope.selectedBranchId
      : (claims.branch_id && branches.some((b) => b.id === claims.branch_id)
          ? claims.branch_id
          : (branches[0]?.id ?? null));

  type IngredientJoinRow = Omit<Ingredient, "units"> & {
    ingredient_units: IngredientUnitJoinRow[] | null;
  };

  const ingredients = ((ingredientsRes.data ?? []) as IngredientJoinRow[]).map(
    ({ ingredient_units, ...ingredient }) => {
      const units: IngredientUnitRow[] = (ingredient_units ?? [])
        .map((u) => ({
          id: u.id,
          unit_id: u.unit_id,
          unit_code: u.units?.code ?? "",
          to_base_factor: Number(u.to_base_factor ?? 1),
          is_base: u.is_base,
          allow_purchase: u.allow_purchase,
          allow_issue: u.allow_issue,
          allow_production: u.allow_production,
          sort_order: u.sort_order,
        }))
        .sort((a, b) => a.sort_order - b.sort_order);
      return {
        ...ingredient,
        unit: ingredient.purchase_unit ?? ingredient.unit,
        units,
      };
    },
  );

  // Sprint 6 #3: pre-fetch active draft (server-side state, no localStorage).
  let existingDraft: {
    id: number;
    lines: Array<GrnDraftLine & { lineId: number }>;
  } | null = null;
  const draftRes = await loadActiveGrnDraft({ supplierId });
  const draftRow = (draftRes.success ? draftRes.data : null) as {
    id: number;
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
        lines: detail.lines.map((l) => ({
          lineId: l.id,
          ingredientId: l.ingredient_id,
          ingredientName: l.ingredients?.name ?? "",
          unit: l.unit,
          entryUnitId: l.entry_unit_id,
          quantity: Number(l.received_quantity ?? 0),
          unitCost: Number(l.unit_cost ?? 0),
        })),
      };
    }
  }

  return (
    <GrnCreateClient
      supplier={{ id: supplierRes.data.id, name: supplierRes.data.name }}
      branchId={defaultBranchId}
      ingredients={ingredients}
      existingDraft={existingDraft}
      basePath={basePath}
      grnBasePath={grnBasePath}
      embedded={embedded}
    />
  );
}

export default async function GrnCreatePage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const { supplierId: supplierIdStr } = await params;
  return <GrnCreatePageContent supplierId={Number(supplierIdStr)} />;
}
