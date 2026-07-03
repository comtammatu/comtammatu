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
import { GrnCreateClient } from "./grn-create-client";

type Ingredient = {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  purchase_unit: string | null;
  unit_cost: number | null;
  category: string | null;
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
      .select("id, name, sku, unit, purchase_unit, unit_cost, category")
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

  const ingredients = ((ingredientsRes.data ?? []) as Ingredient[]).map(
    (ingredient) => ({
      ...ingredient,
      unit: ingredient.purchase_unit ?? ingredient.unit,
    }),
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
