import { notFound } from "next/navigation";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";
import { messages } from "@lib/messages";
import {
  BranchStockRequestsClient,
  type BranchStockRequestRow,
} from "./branch-stock-requests-client";

type IngredientJoin = {
  id: number;
  name: string;
  sku: string | null;
  ingredient_units: Array<{
    id: number;
    unit_id: number;
    is_base: boolean;
    is_active: boolean;
    sort_order: number;
    units: { code: string; name: string } | null;
  }> | null;
};

type RequestItemRow = {
  id: number;
  request_id: number;
  ingredient_id: number;
  entry_unit_id: number;
  quantity: number;
};

const copy = messages.inventory.stockRequests.branch;

export default async function BranchStockRequestsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const { supabase, claims } = await loadAuthState();
  const context = await resolveBranchContext(supabase, claims, branchId);
  if (!context) notFound();

  const [{ data: requestRows }, { data: ingredientRows }] = await Promise.all([
    supabase
      .from("stock_requests")
      .select("id, request_number, status, created_at")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("ingredients")
      .select(
        "id, name, sku, ingredient_units!ingredient_units_ingredient_tenant_fkey(id, unit_id, is_base, is_active, sort_order, units!ingredient_units_unit_tenant_fkey(code, name))",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("name"),
  ]);

  const ingredients = ((ingredientRows ?? []) as IngredientJoin[]).map(
    (ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      sku: ingredient.sku,
      units: (ingredient.ingredient_units ?? [])
        .filter((unit) => unit.is_active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((unit) => ({
          id: unit.unit_id,
          label: unit.units?.name ?? unit.units?.code ?? "",
          isBase: unit.is_base,
        })),
    }),
  );
  const requestIds = (requestRows ?? []).map((row) => row.id);
  const { data: requestItemRows } =
    requestIds.length === 0
      ? { data: [] as RequestItemRow[] }
      : await supabase
          .from("stock_request_items")
          .select("id, request_id, ingredient_id, entry_unit_id, quantity")
          .eq("tenant_id", claims.tenant_id)
          .in("request_id", requestIds)
          .order("id");
  const ingredientById = new Map(
    ingredients.map((ingredient) => [ingredient.id, ingredient] as const),
  );
  const itemsByRequestId = new Map<number, BranchStockRequestRow["items"]>();
  for (const item of (requestItemRows ?? []) as RequestItemRow[]) {
    const ingredient = ingredientById.get(item.ingredient_id);
    const units = ingredient?.units ?? [];
    const unit = units.find((candidate) => candidate.id === item.entry_unit_id);
    const items = itemsByRequestId.get(item.request_id) ?? [];
    items.push({
      id: item.id,
      ingredientId: item.ingredient_id,
      ingredientName: ingredient?.name ?? `#${item.ingredient_id}`,
      entryUnitId: item.entry_unit_id,
      unitLabel: unit?.label ?? "",
      quantity: Number(item.quantity),
    });
    itemsByRequestId.set(item.request_id, items);
  }
  const rows: BranchStockRequestRow[] = (requestRows ?? []).map((row) => ({
    id: row.id,
    code: row.request_number,
    status: row.status,
    createdAt: row.created_at,
    items: itemsByRequestId.get(row.id) ?? [],
  }));

  return (
    <BranchOperatorPage
      title={copy.listTitle}
      description={copy.listDescription}
    >
      <BranchStockRequestsClient
        branchId={branchId}
        rows={rows}
        ingredients={ingredients}
      />
    </BranchOperatorPage>
  );
}
