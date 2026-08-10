import { notFound, redirect } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import { resolveBranchContext } from "@/_lib/branch-context";
import { AppEmptyState } from "@/components/surface";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import type { IngredientRow } from "@lib/inventory/types";
import { purchaseDemandLineProgress } from "@lib/inventory/purchase-demand-progress";
import type {
  PurchaseRequestIngredientOption,
  PurchaseRequestRow,
} from "@lib/inventory/purchase-request-model";
import { loadSuggestedOrderQtyByIngredient } from "@lib/inventory/load-suggested-order-qty";
import { suggestedOrderQtyInEntryUnit } from "@lib/inventory/suggested-order-qty";
import { fetchProcurementBranches } from "@/(protected)/inventory/_lib/procurement-branches";
import { fetchIngredients } from "@/(protected)/inventory/ingredient-actions";
import type { PurchaseOrderSupplier } from "@/(protected)/inventory/purchase-requests/purchase-order-drafts";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";
import { BranchPurchaseRequestsClient } from "./branch-purchase-requests-client";

const DEMAND_SELECT =
  "id, request_number, branch_id, status, status_reason, needed_by, notes, created_at, updated_at, purchase_request_items(id, ingredient_id, quantity, entry_unit_id, notes, ingredients(name, ingredient_units!ingredient_units_ingredient_tenant_fkey(unit_id, to_base_factor, is_active)), units!purchase_request_items_entry_unit_id_fkey(code, name)), purchase_orders(id, po_number, display_id, status, supplier_id, purchase_order_items(purchase_request_item_id, quantity, entry_to_base_factor))";
const DEMAND_SELECT_WITH_ALLOCATIONS = `${DEMAND_SELECT}, purchase_request_allocations(purchase_request_item_id, supplier_id, quantity)`;

type DemandRecord = {
  id: number;
  request_number: string;
  branch_id: number;
  status: string;
  status_reason: string | null;
  needed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  purchase_request_items: Array<{
    id: number;
    ingredient_id: number;
    quantity: number | string;
    entry_unit_id: number;
    notes: string | null;
    ingredients:
      | {
          name: string;
          ingredient_units?: Array<{
            unit_id: number;
            to_base_factor: number | string;
            is_active: boolean;
          }> | null;
        }
      | {
          name: string;
          ingredient_units?: Array<{
            unit_id: number;
            to_base_factor: number | string;
            is_active: boolean;
          }> | null;
        }[]
      | null;
    units:
      | { code: string; name: string | null }
      | { code: string; name: string | null }[]
      | null;
  }>;
  purchase_request_allocations?: Array<{
    purchase_request_item_id: number;
    supplier_id: number;
    quantity: number | string;
  }>;
  purchase_orders: Array<{
    id: number;
    po_number: string;
    display_id: string | null;
    status: string;
    supplier_id: number;
    purchase_order_items: Array<{
      purchase_request_item_id: number | null;
      quantity: number | string;
      entry_to_base_factor: number | string | null;
    }>;
  }>;
};

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function OperatorPurchaseRequestsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const { supabase, claims } = await loadAuthState();
  const branchContext = await resolveBranchContext(supabase, claims, branchId);
  if (!branchContext) notFound();
  if (branchContext.branch.branch_kind === "branch") {
    redirect(`/br/${branchId}/stock`);
  }

  const [
    procurementBranches,
    ingredientResult,
    canCreateRequest,
    canAllocate,
  ] = await Promise.all([
    fetchProcurementBranches(supabase, claims.tenant_id),
    fetchIngredients(),
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_REQUEST_MANAGE),
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_PO_APPROVE),
  ]);

  const demandResult = await supabase
    .from("purchase_requests" as never)
    .select(
      (canAllocate
        ? DEMAND_SELECT_WITH_ALLOCATIONS
        : DEMAND_SELECT) as never,
    )
    .eq("tenant_id" as never, claims.tenant_id)
    .eq("branch_id" as never, branchId)
    .order("updated_at" as never, { ascending: false })
    .limit(200);

  const supplierResult = canAllocate
    ? await supabase
        .from("suppliers")
        .select("id, name")
        .eq("tenant_id", claims.tenant_id)
        .eq("is_active", true)
        .order("name")
    : { data: [], error: null };

  const supplierItemResult = await supabase
    .from("supplier_items")
    .select("supplier_id, ingredient_id, is_preferred")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true);

  if (
    demandResult.error ||
    supplierResult.error ||
    supplierItemResult.error ||
    !ingredientResult.success
  ) {
    return (
      <BranchOperatorPage title={messages.inventory.po.workspaceTitle}>
        <AppEmptyState
          mode="error"
          title={messages.inventory.po.loadErrorTitle}
          description={messages.inventory.po.loadErrorDescription}
        />
      </BranchOperatorPage>
    );
  }

  const branches = procurementBranches.map((branch) => ({
    id: branch.id,
    name: branch.name,
  }));
  const branchNames = new Map(branches.map((branch) => [branch.id, branch.name]));
  const supplierNames = new Map(
    (supplierResult.data ?? []).map((supplier) => [supplier.id, supplier.name]),
  );
  const supplierMappings = supplierItemResult.data ?? [];
  const mappedIngredientIds = [
    ...new Set(supplierMappings.map((item) => item.ingredient_id)),
  ];
  const supplierIngredientIds = Object.groupBy(
    supplierMappings,
    (item) => String(item.supplier_id),
  );
  const suppliers: PurchaseOrderSupplier[] = canAllocate
    ? (supplierResult.data ?? []).map((supplier) => ({
        id: supplier.id,
        name: supplier.name,
        ingredientIds: (
          supplierIngredientIds[String(supplier.id)] ?? []
        ).map((item) => item.ingredient_id),
        preferredIngredientIds: (
          supplierIngredientIds[String(supplier.id)] ?? []
        )
          .filter((item) => item.is_preferred)
          .map((item) => item.ingredient_id),
      }))
    : [];

  const demandRecords = (demandResult.data ?? []) as unknown as DemandRecord[];
  const demandRows = demandRecords.map((request): PurchaseRequestRow => {
    const orderedLinesByItem = new Map<
      number,
      Array<{ quantity: number; entryToBaseFactor: number }>
    >();
    for (const po of request.purchase_orders ?? []) {
      if (po.status === "cancelled") continue;
      for (const line of po.purchase_order_items ?? []) {
        if (line.purchase_request_item_id == null) continue;
        const factor = Number(line.entry_to_base_factor);
        const lines = orderedLinesByItem.get(line.purchase_request_item_id) ?? [];
        lines.push({
          quantity: Number(line.quantity),
          entryToBaseFactor: Number.isFinite(factor) ? factor : 0,
        });
        orderedLinesByItem.set(line.purchase_request_item_id, lines);
      }
    }
    const items = (request.purchase_request_items ?? []).map((item) => {
      const ingredient = one(item.ingredients);
      const demandFactor = Number(
        (ingredient?.ingredient_units ?? []).find(
          (unit) => unit.is_active && unit.unit_id === item.entry_unit_id,
        )?.to_base_factor ?? 0,
      );
      const { orderedQuantity, remainingQuantity } = purchaseDemandLineProgress({
        demandQuantity: Number(item.quantity),
        demandToBaseFactor: Number.isFinite(demandFactor) ? demandFactor : 0,
        orderedLines: orderedLinesByItem.get(item.id) ?? [],
      });
      return {
        id: item.id,
        ingredientId: item.ingredient_id,
        ingredientName: ingredient?.name ?? "Nguyên liệu",
        quantity: Number(item.quantity),
        orderedQuantity,
        remainingQuantity,
        entryUnitId: item.entry_unit_id,
        unitLabel: one(item.units)?.name ?? one(item.units)?.code ?? "Đơn vị",
        notes: item.notes,
      };
    });
    return {
      id: request.id,
      code: request.request_number,
      branchId: request.branch_id,
      branchName: branchNames.get(request.branch_id) ?? `#${request.branch_id}`,
      status: request.status,
      statusReason: request.status_reason,
      neededBy: request.needed_by,
      notes: request.notes,
      createdAt: request.created_at,
      updatedAt: request.updated_at,
      lineCount: items.length,
      orderedLineCount: items.filter((item) => item.remainingQuantity === 0)
        .length,
      items,
      allocations: (request.purchase_request_allocations ?? []).map(
        (allocation) => ({
          requestItemId: allocation.purchase_request_item_id,
          supplierId: allocation.supplier_id,
          quantity: Number(allocation.quantity),
        }),
      ),
      purchaseOrders: (request.purchase_orders ?? []).map((po) => ({
        id: po.id,
        code: po.display_id ?? po.po_number,
        status: po.status,
        supplierName: supplierNames.get(po.supplier_id) ?? "Nhà cung cấp",
      })),
    };
  });

  const ingredientRows = (ingredientResult.data ?? []) as IngredientRow[];
  const suggestedByIngredient = await loadSuggestedOrderQtyByIngredient({
    supabase,
    tenantId: claims.tenant_id,
    branchId,
    ingredientIds: ingredientRows.map((ingredient) => ingredient.id),
    minStockByIngredient: new Map(
      ingredientRows.map((ingredient) => [
        ingredient.id,
        ingredient.min_stock_level,
      ]),
    ),
  });
  const ingredientOptions: PurchaseRequestIngredientOption[] =
    ingredientRows.map((ingredient) => {
      const units = (ingredient.units ?? [])
        .filter((unit) => unit.is_active)
        .map((unit) => ({
          id: unit.unit_id,
          label: unit.unit_name || unit.unit_code,
          factor: unit.to_base_factor,
        }));
      const defaultUnit = units.reduce<
        (typeof units)[number] | undefined
      >(
        (selected, unit) =>
          selected == null || unit.factor > selected.factor ? unit : selected,
        undefined,
      );
      return {
        id: ingredient.id,
        name: ingredient.name,
        suggestedOrderQty: suggestedOrderQtyInEntryUnit(
          suggestedByIngredient.get(ingredient.id) ?? 0,
          defaultUnit?.factor ?? 1,
        ),
        units,
      };
    });

  const requestBranches = [
    { id: branchId, name: branchContext.branch.name },
  ];

  return (
    <BranchPurchaseRequestsClient
      rows={demandRows}
      branches={requestBranches}
      ingredients={ingredientOptions}
      suppliers={suppliers}
      mappedIngredientIds={mappedIngredientIds}
      canCreateRequest={canCreateRequest}
      canAllocate={canAllocate}
      branchId={branchId}
      branchName={branchContext.branch.name}
    />
  );
}
