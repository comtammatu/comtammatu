import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { fetchIngredients } from "../ingredient-actions";
import { fetchProcurementBranches } from "../_lib/procurement-branches";
import { loadInventoryMonetaryAccess } from "@lib/inventory/monetary-access";
import type { IngredientRow } from "@lib/inventory/types";
import { messages } from "@lib/messages";
import {
  PurchaseRequestsClient,
  type PurchaseRequestIngredientOption,
  type PurchaseRequestRow,
} from "./purchase-requests-client";

type RequestRecord = {
  id: number;
  request_number: string;
  branch_id: number;
  status: string;
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
    ingredients: { name: string } | { name: string }[] | null;
    units:
      | { code: string; name: string | null }
      | { code: string; name: string | null }[]
      | null;
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
    }>;
  }>;
};

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function PurchaseRequestsPage() {
  const copy = messages.inventory.purchaseRequests;
  const { supabase, claims } = await loadAuthState();
  const monetary = await loadInventoryMonetaryAccess(claims.user_role);
  const [
    requestResult,
    supplierResult,
    supplierItemResult,
    procurementBranches,
    ingredientResult,
    canCreateRequest,
    canCreatePo,
  ] = await Promise.all([
    supabase
      .from("purchase_requests" as never)
      .select(
        "id, request_number, branch_id, status, needed_by, notes, created_at, updated_at, purchase_request_items(id, ingredient_id, quantity, entry_unit_id, notes, ingredients(name), units!purchase_request_items_entry_unit_id_fkey(code, name)), purchase_orders(id, po_number, display_id, status, supplier_id, purchase_order_items(purchase_request_item_id, quantity))" as never,
      )
      .eq("tenant_id" as never, claims.tenant_id)
      .order("updated_at" as never, { ascending: false })
      .limit(200),
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("supplier_items")
      .select("supplier_id, ingredient_id, is_preferred")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true),
    fetchProcurementBranches(supabase, claims.tenant_id),
    fetchIngredients(),
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_GRN_CREATE),
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_PO_CREATE),
  ]);

  if (
    requestResult.error ||
    supplierResult.error ||
    supplierItemResult.error ||
    !ingredientResult.success
  ) {
    return (
      <AppPage width="xwide" density="compact">
        <AppPageHeader title={copy.title} description={copy.description} />
        <AppEmptyState mode="error" title={copy.loadFailed} />
      </AppPage>
    );
  }

  const branchNames = new Map(
    procurementBranches.map((branch) => [branch.id, branch.name]),
  );
  const supplierNames = new Map(
    (supplierResult.data ?? []).map((supplier) => [supplier.id, supplier.name]),
  );
  const rows = ((requestResult.data ?? []) as unknown as RequestRecord[]).map(
    (request): PurchaseRequestRow => {
      const orderedByItem = new Map<number, number>();
      for (const po of request.purchase_orders ?? []) {
        if (po.status === "cancelled") continue;
        for (const line of po.purchase_order_items ?? []) {
          if (line.purchase_request_item_id == null) continue;
          orderedByItem.set(
            line.purchase_request_item_id,
            (orderedByItem.get(line.purchase_request_item_id) ?? 0) +
              Number(line.quantity),
          );
        }
      }
      const items = (request.purchase_request_items ?? []).map((item) => {
        const ingredient = one(item.ingredients);
        const unit = one(item.units);
        const orderedQuantity = orderedByItem.get(item.id) ?? 0;
        return {
          id: item.id,
          ingredientId: item.ingredient_id,
          ingredientName: ingredient?.name ?? "Nguyên liệu",
          quantity: Number(item.quantity),
          orderedQuantity,
          remainingQuantity: Math.max(
            Number(item.quantity) - orderedQuantity,
            0,
          ),
          entryUnitId: item.entry_unit_id,
          unitLabel: unit?.name ?? unit?.code ?? "Đơn vị",
          notes: item.notes,
        };
      });
      return {
        id: request.id,
        code: request.request_number,
        branchId: request.branch_id,
        branchName:
          branchNames.get(request.branch_id) ?? `#${request.branch_id}`,
        status: request.status,
        neededBy: request.needed_by,
        notes: request.notes,
        createdAt: request.created_at,
        updatedAt: request.updated_at,
        lineCount: items.length,
        orderedLineCount: items.filter((item) => item.remainingQuantity === 0)
          .length,
        items,
        purchaseOrders: (request.purchase_orders ?? []).map((po) => ({
          id: po.id,
          code: po.display_id ?? po.po_number,
          status: po.status,
          supplierName: supplierNames.get(po.supplier_id) ?? "Nhà cung cấp",
        })),
      };
    },
  );

  const ingredients = (ingredientResult.data ?? []) as IngredientRow[];
  const ingredientOptions: PurchaseRequestIngredientOption[] = ingredients.map(
    (ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      units: (ingredient.units ?? [])
        .filter((unit) => unit.is_active)
        .map((unit) => ({
          id: unit.unit_id,
          label: unit.unit_name || unit.unit_code,
          factor: unit.to_base_factor,
        })),
    }),
  );
  const supplierIngredientIds = Object.groupBy(
    supplierItemResult.data ?? [],
    (item) => String(item.supplier_id),
  );

  return (
    <PurchaseRequestsClient
      rows={rows}
      branches={procurementBranches.map((branch) => ({
        id: branch.id,
        name: branch.name,
      }))}
      ingredients={ingredientOptions}
      suppliers={(supplierResult.data ?? []).map((supplier) => ({
        id: supplier.id,
        name: supplier.name,
        ingredientIds: (supplierIngredientIds[String(supplier.id)] ?? []).map(
          (item) => item.ingredient_id,
        ),
        preferredIngredientIds: (
          supplierIngredientIds[String(supplier.id)] ?? []
        )
          .filter((item) => item.is_preferred)
          .map((item) => item.ingredient_id),
      }))}
      canCreateRequest={canCreateRequest}
      canCreatePo={canCreatePo && monetary.purchasePrice}
    />
  );
}
