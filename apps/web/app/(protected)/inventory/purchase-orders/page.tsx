import { notFound } from "next/navigation";
import {
  PERMISSION_KEYS,
  isProcurementBranchInScope,
} from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { messages } from "@lib/messages";
import { fetchProcurementBranches } from "../_lib/procurement-branches";
import { resolveInventoryListScope } from "../_lib/inventory-scope";
import {
  PurchaseOrdersClient,
  type PurchaseOrderIngredient,
  type PurchaseOrderOption,
  type PurchaseOrderRow,
} from "./purchase-orders-client";

type IngredientUnitJoin = {
  unit_id: number;
  is_active: boolean;
  sort_order: number;
  units: { code: string; name: string | null } | null;
};

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const params = await searchParams;
  const copy = messages.inventory.po;
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    queryBranchId: params.branchId,
  });
  if (scope.outOfScope) notFound();

  let poQuery = supabase
    .from("purchase_orders")
    .select(
      "id, po_number, display_id, status, ordered_at, supplier_id, branch_id, purchase_order_items(line_total)",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("ordered_at", { ascending: false })
    .limit(100);
  if (scope.selectedBranchId != null) {
    poQuery = poQuery.eq("branch_id", scope.selectedBranchId);
  }

  const [
    poResult,
    supplierResult,
    ingredientResult,
    procurementBranches,
    canCreate,
    canApprove,
    canCreateGrn,
  ] = await Promise.all([
    poQuery,
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("ingredients")
      .select(
        "id, name, ingredient_units!ingredient_units_ingredient_tenant_fkey(unit_id, is_active, sort_order, units!ingredient_units_unit_tenant_fkey(code, name))",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("name")
      .limit(500),
    fetchProcurementBranches(supabase, claims.tenant_id),
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_PO_CREATE),
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_PO_APPROVE),
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_GRN_CREATE),
  ]);

  if (poResult.error || supplierResult.error || ingredientResult.error) {
    return (
      <AppPage width="xwide" density="compact">
        <AppPageHeader eyebrow="Kho hàng" title={copy.pageTitle} />
        <AppEmptyState
          mode="error"
          title={copy.loadErrorTitle}
          description={copy.loadErrorDescription}
        />
      </AppPage>
    );
  }

  const branches: PurchaseOrderOption[] = procurementBranches
    .filter((branch) =>
      isProcurementBranchInScope(claims.user_role, claims.branch_id, branch.id),
    )
    .map((branch) => ({ id: branch.id, name: branch.name }));
  const branchNames = new Map(
    procurementBranches.map((branch) => [branch.id, branch.name]),
  );
  const suppliers: PurchaseOrderOption[] = supplierResult.data ?? [];
  const supplierNames = new Map(
    suppliers.map((supplier) => [supplier.id, supplier.name]),
  );
  const ingredients: PurchaseOrderIngredient[] = (
    ingredientResult.data ?? []
  ).flatMap((ingredient) => {
    const units = (ingredient.ingredient_units as IngredientUnitJoin[] | null)
      ?.filter((unit) => unit.is_active)
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((unit) => ({
        id: unit.unit_id,
        name: unit.units?.name ?? unit.units?.code ?? "Đơn vị",
      }));
    return units?.length
      ? [{ id: ingredient.id, name: ingredient.name, units }]
      : [];
  });
  const rows: PurchaseOrderRow[] = (poResult.data ?? []).map((po) => {
    const totals = (po.purchase_order_items ?? []).flatMap((line) =>
      line.line_total == null ? [] : [Number(line.line_total)],
    );
    return {
      id: po.id,
      code: po.display_id ?? po.po_number,
      status: po.status,
      orderedAt: po.ordered_at,
      supplierName: supplierNames.get(po.supplier_id) ?? "NCC",
      branchName: branchNames.get(po.branch_id) ?? "Chi nhánh",
      lineCount: po.purchase_order_items.length,
      estimatedTotal:
        totals.length > 0
          ? totals.reduce((sum, amount) => sum + amount, 0)
          : null,
    };
  });

  return (
    <PurchaseOrdersClient
      rows={rows}
      suppliers={suppliers}
      branches={branches}
      ingredients={ingredients}
      defaultBranchId={
        scope.selectedBranchId ?? claims.branch_id ?? branches[0]?.id ?? null
      }
      canCreate={canCreate}
      canApprove={canApprove}
      canCreateGrn={canCreateGrn}
    />
  );
}
