import { notFound } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
} from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { messages } from "@lib/messages";
import type { IngredientRow } from "@lib/inventory/types";
import { fetchProcurementBranches } from "../_lib/procurement-branches";
import { resolveInventoryListScope } from "../_lib/inventory-scope";
import { purchaseDemandLineProgress } from "@lib/inventory/purchase-demand-progress";
import { fetchIngredients } from "../ingredient-actions";
import {
  PurchaseRequestsClient,
  type PurchaseRequestIngredientOption,
  type PurchaseRequestRow,
} from "../purchase-requests/purchase-requests-client";
import type { PurchaseOrderSupplier } from "../purchase-requests/purchase-order-drafts";
import {
  PurchaseOrdersClient,
  type PurchaseOrderRow,
} from "./purchase-orders-client";

const DEMAND_SELECT =
  "id, request_number, branch_id, status, status_reason, needed_by, notes, created_at, updated_at, purchase_request_items(id, ingredient_id, quantity, entry_unit_id, notes, ingredients(name, ingredient_units!ingredient_units_ingredient_tenant_fkey(unit_id, to_base_factor, is_active)), units!purchase_request_items_entry_unit_id_fkey(code, name)), purchase_orders(id, po_number, display_id, status, supplier_id, purchase_order_items(purchase_request_item_id, quantity, entry_to_base_factor))";
const DEMAND_SELECT_WITH_ALLOCATIONS = `${DEMAND_SELECT}, purchase_request_allocations(purchase_request_item_id, supplier_id, quantity)`;
const ORDER_SELECT =
  "id, po_number, display_id, status, ordered_at, expected_delivery_date, notes, status_reason, supplier_id, branch_id, purchase_group_key, purchase_group_code, group_sequence, purchase_order_items(id, ingredient_id, quantity, entry_unit_id, ingredients(name), units!purchase_order_items_entry_unit_id_fkey(code, name)), goods_received_notes!goods_received_notes_po_id_fkey(id, grn_number, status, received_date, grn_items(purchase_order_item_id, received_quantity, rejected_quantity))";

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

type PurchaseOrderRecord = {
  id: number;
  po_number: string;
  display_id: string | null;
  status: string;
  ordered_at: string;
  expected_delivery_date: string | null;
  notes: string | null;
  status_reason: string | null;
  supplier_id: number;
  branch_id: number;
  purchase_group_key: string | null;
  purchase_group_code: string | null;
  group_sequence: number | null;
  purchase_order_items: Array<{
    id: number;
    ingredient_id: number;
    quantity: number | string;
    entry_unit_id: number;
    ingredients: { name: string } | { name: string }[] | null;
    units:
      | { code: string; name: string | null }
      | { code: string; name: string | null }[]
      | null;
  }>;
  goods_received_notes: Array<{
    id: number;
    grn_number: string;
    status: string;
    received_date: string | null;
    grn_items: Array<{
      purchase_order_item_id: number | null;
      received_quantity: number | string;
      rejected_quantity: number | string;
    }>;
  }>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string | string[];
    branchId?: string | string[];
    demandId?: string | string[];
    poId?: string | string[];
    mode?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    queryBranchId: params.branchId,
  });
  if (scope.outOfScope) notFound();

  const [
    procurementBranches,
    ingredientResult,
    canCreateRequest,
    canAllocate,
    canManagePo,
    canReceive,
  ] = await Promise.all([
    fetchProcurementBranches(supabase, claims.tenant_id),
    fetchIngredients(),
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_REQUEST_MANAGE),
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_PO_APPROVE),
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_PO_CREATE),
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_GRN_CREATE),
  ]);

  let demandQuery = supabase
    .from("purchase_requests" as never)
    .select(
      (canAllocate
        ? DEMAND_SELECT_WITH_ALLOCATIONS
        : DEMAND_SELECT) as never,
    )
    .eq("tenant_id" as never, claims.tenant_id)
    .order("updated_at" as never, { ascending: false })
    .limit(200);
  let poQuery = supabase
    .from("purchase_orders")
    .select(ORDER_SELECT as never)
    .eq("tenant_id", claims.tenant_id)
    .order("ordered_at", { ascending: false })
    .limit(200);
  if (scope.selectedBranchId != null) {
    demandQuery = demandQuery.eq(
      "branch_id" as never,
      scope.selectedBranchId as never,
    );
    poQuery = poQuery.eq("branch_id", scope.selectedBranchId);
  }

  const [
    demandResult,
    poResult,
    supplierResult,
    supplierItemResult,
  ] = await Promise.all([
    demandQuery,
    poQuery,
    canAllocate
      ? supabase
          .from("suppliers")
          .select("id, name")
          .eq("tenant_id", claims.tenant_id)
          .eq("is_active", true)
          .order("name")
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("supplier_items")
      .select("supplier_id, ingredient_id, is_preferred")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true),
  ]);

  if (
    demandResult.error ||
    poResult.error ||
    supplierResult.error ||
    supplierItemResult.error ||
    !ingredientResult.success
  ) {
    return (
      <AppPage width="xwide" density="compact">
        <AppPageHeader title={messages.inventory.po.workspaceTitle} />
        <AppEmptyState
          mode="error"
          title={messages.inventory.po.loadErrorTitle}
          description={messages.inventory.po.loadErrorDescription}
        />
      </AppPage>
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
          (unit) =>
            unit.is_active && unit.unit_id === item.entry_unit_id,
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
        unitLabel:
          one(item.units)?.name ?? one(item.units)?.code ?? "Đơn vị",
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

  const poRows = (
    (poResult.data ?? []) as unknown as PurchaseOrderRecord[]
  ).map((po): PurchaseOrderRow => {
    const linkedGrns = (po.goods_received_notes ?? []).map((grn) => ({
      id: grn.id,
      code: grn.grn_number,
      status: grn.status,
      receivedAt: grn.received_date,
    }));
    const receivedByLine = new Map<number, number>();
    for (const grn of po.goods_received_notes ?? []) {
      if (grn.status !== "confirmed") continue;
      for (const line of grn.grn_items ?? []) {
        if (line.purchase_order_item_id == null) continue;
        receivedByLine.set(
          line.purchase_order_item_id,
          (receivedByLine.get(line.purchase_order_item_id) ?? 0) +
            Number(line.received_quantity) -
            Number(line.rejected_quantity),
        );
      }
    }
    return {
      id: po.id,
      code: po.display_id ?? po.po_number,
      groupKey: po.purchase_group_key,
      groupCode: po.purchase_group_code,
      groupSequence: po.group_sequence,
      status: po.status,
      statusReason: po.status_reason,
      orderedAt: po.ordered_at,
      expectedDeliveryDate: po.expected_delivery_date,
      notes: po.notes,
      supplierId: po.supplier_id,
      supplierName:
        supplierNames.get(po.supplier_id) ??
        messages.inventory.po.supplierRequired,
      branchId: po.branch_id,
      branchName:
        branchNames.get(po.branch_id) ?? messages.inventory.po.branchLabel,
      lines: (po.purchase_order_items ?? []).map((line) => ({
        id: line.id,
        ingredientId: line.ingredient_id,
        ingredientName: one(line.ingredients)?.name ?? "Nguyên liệu",
        quantity: Number(line.quantity),
        receivedQuantity: receivedByLine.get(line.id) ?? 0,
        entryUnitId: line.entry_unit_id,
        unitLabel:
          one(line.units)?.name ?? one(line.units)?.code ?? "Đơn vị",
      })),
      linkedGrns,
      activeDraftGrnId:
        linkedGrns.find((grn) => grn.status === "draft")?.id ?? null,
    };
  });

  const ingredientOptions: PurchaseRequestIngredientOption[] = (
    (ingredientResult.data ?? []) as IngredientRow[]
  ).map((ingredient) => ({
    id: ingredient.id,
    name: ingredient.name,
    units: (ingredient.units ?? [])
      .filter((unit) => unit.is_active)
      .map((unit) => ({
        id: unit.unit_id,
        label: unit.unit_name || unit.unit_code,
        factor: unit.to_base_factor,
      })),
  }));
  const requestBranches =
    claims.user_role === "owner"
      ? branches
      : branches.filter((branch) => branch.id === claims.branch_id);
  const requestedTab = firstParam(params.tab);
  const hasPendingDemand = demandRows.some((row) =>
    ["submitted", "pending_allocation", "partially_ordered"].includes(
      row.status,
    ),
  );
  const defaultTab =
    requestedTab === "needs" || requestedTab === "orders"
      ? requestedTab
      : claims.user_role === "accountant" || claims.user_role === "owner"
        ? hasPendingDemand
          ? "needs"
          : "orders"
        : "needs";

  const needsContent = (
    <PurchaseRequestsClient
      rows={demandRows}
      branches={requestBranches}
      ingredients={ingredientOptions}
      suppliers={suppliers}
      mappedIngredientIds={mappedIngredientIds}
      canCreateRequest={canCreateRequest && requestBranches.length > 0}
      canAllocate={canAllocate}
      embedded
    />
  );
  const ordersContent = (
    <PurchaseOrdersClient
      rows={poRows}
      branches={branches}
      canManage={canManagePo || canAllocate}
      canReceive={canReceive}
      embedded
    />
  );

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={messages.inventory.po.workspaceTitle}
        description={messages.inventory.po.workspaceDescription}
      />
      <AppPageTabs
        items={[
          {
            value: "needs",
            label: "Nhu cầu mua",
            count: demandRows.filter((row) =>
              ["submitted", "pending_allocation", "partially_ordered"].includes(
                row.status,
              ),
            ).length,
          },
          { value: "orders", label: "Đơn mua", count: poRows.length },
        ]}
        defaultValue={defaultTab}
        ariaLabel="Mua hàng"
      >
        <TabsContent value="needs" className="mt-0">
          {needsContent}
        </TabsContent>
        <TabsContent value="orders" className="mt-0">
          {ordersContent}
        </TabsContent>
      </AppPageTabs>
    </AppPage>
  );
}
