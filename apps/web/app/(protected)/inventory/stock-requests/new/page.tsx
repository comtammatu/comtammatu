import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { STOCK_REQUEST_ROLES } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { AppPageHeader, DocumentFormFrame } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { resolveInventoryListScope } from "../../_lib/inventory-scope";
import {
  StockRequestEditor,
  type StockRequestEditorLine,
  type StockRequestIngredientOption,
} from "@/(protected)/br/[branchId]/(operator)/stock/requests/new/stock-request-editor";
import { loadSuggestedOrderQtyByIngredient } from "@lib/inventory/load-suggested-order-qty";

type IngredientJoin = {
  id: number;
  name: string;
  sku: string | null;
  min_stock_level: number | null;
  default_fulfill_site_kind: "central_supply" | "central_kitchen" | null;
  ingredient_units: Array<{
    unit_id: number;
    is_base: boolean;
    is_active: boolean;
    sort_order: number;
    units: { code: string; name: string } | null;
  }> | null;
};

export default async function CentralKitchenStockRequestNewPage({
  searchParams,
}: {
  searchParams: Promise<{
    branchId?: string | string[];
    requestId?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const { supabase, claims } = await loadAuthState();
  if (
    !STOCK_REQUEST_ROLES.includes(
      claims.user_role as (typeof STOCK_REQUEST_ROLES)[number],
    )
  ) {
    redirect("/inventory");
  }
  const scope = await resolveInventoryListScope(supabase, claims, {
    queryBranchId: query.branchId,
  });
  const branchId = scope.selectedBranchId;
  if (branchId == null || scope.outOfScope) notFound();
  const requestIdValue = Array.isArray(query.requestId)
    ? query.requestId[0]
    : query.requestId;
  const parsedRequestId = Number(requestIdValue);
  const requestId =
    Number.isInteger(parsedRequestId) && parsedRequestId > 0
      ? parsedRequestId
      : null;

  const [branchResult, ingredientsResult, requestResult] = await Promise.all([
    supabase
      .from("branches")
      .select("name, branch_kind")
      .eq("tenant_id", claims.tenant_id)
      .eq("id", branchId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("ingredients")
      .select(
        "id, name, sku, min_stock_level, default_fulfill_site_kind, ingredient_units!ingredient_units_ingredient_tenant_fkey(unit_id, is_base, is_active, sort_order, units!ingredient_units_unit_tenant_fkey(code, name))",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .eq("default_fulfill_site_kind", "central_supply")
      .order("name"),
    requestId == null
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from("stock_requests")
          .select("id, status, needed_at, notes")
          .eq("tenant_id", claims.tenant_id)
          .eq("branch_id", branchId)
          .eq("id", requestId)
          .maybeSingle(),
  ]);
  if (branchResult.error || ingredientsResult.error || requestResult.error) {
    throw new Error("inventory.stock_request_editor.load_failed");
  }
  if (branchResult.data?.branch_kind !== "central_kitchen") {
    redirect(
      `/inventory/transfers${branchId == null ? "" : `?branchId=${branchId}`}`,
    );
  }
  const request = requestResult.data as {
    status: string;
    needed_at: string | null;
    notes: string | null;
  } | null;
  if (
    requestId != null &&
    (!request || !["draft", "submitted"].includes(request.status))
  ) {
    notFound();
  }

  const ingredientJoins = (ingredientsResult.data ?? []) as IngredientJoin[];
  const suggestedByIngredient = await loadSuggestedOrderQtyByIngredient({
    supabase,
    tenantId: claims.tenant_id,
    branchId,
    ingredientIds: ingredientJoins.map((ingredient) => ingredient.id),
    minStockByIngredient: new Map(
      ingredientJoins.map((ingredient) => [
        ingredient.id,
        ingredient.min_stock_level,
      ]),
    ),
  });
  const ingredients: StockRequestIngredientOption[] = ingredientJoins.map(
    (ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      sku: ingredient.sku,
      fulfillSiteKind: ingredient.default_fulfill_site_kind ?? "central_supply",
      suggestedOrderQty: suggestedByIngredient.get(ingredient.id) ?? 0,
      units: (ingredient.ingredient_units ?? [])
        .filter((unit) => unit.is_active)
        .sort((left, right) => left.sort_order - right.sort_order)
        .map((unit) => ({
          id: unit.unit_id,
          label: unit.units?.name ?? unit.units?.code ?? "",
          isBase: unit.is_base,
        })),
    }),
  );
  const itemsResult =
    requestId == null
      ? { data: [], error: null }
      : await supabase
          .from("stock_request_items")
          .select("id, ingredient_id, entry_unit_id, quantity, status")
          .eq("tenant_id", claims.tenant_id)
          .eq("request_id", requestId)
          .order("id");
  if (
    itemsResult.error ||
    (itemsResult.data ?? []).some((item) => item.status !== "pending")
  ) {
    notFound();
  }
  const lines: StockRequestEditorLine[] = (itemsResult.data ?? []).map(
    (item) => ({
      id: item.id,
      ingredientId: item.ingredient_id,
      entryUnitId: item.entry_unit_id,
      quantity: Number(item.quantity),
    }),
  );

  return (
    <DocumentFormFrame
      width="wide"
      density="compact"
      header={
        <AppPageHeader
          title={
            messages.inventory.stockRequests.journey.centralSupplyRequestAction
          }
          description={messages.inventory.stockRequests.journey.centralSupplyRequestDescription(
            branchResult.data.name,
          )}
          actions={
            <Button
              variant="ghost"
              render={
                <Link href={`/inventory/transfers?branchId=${branchId}`} />
              }
            >
              {messages.inventory.stockRequests.journey.back}
            </Button>
          }
        />
      }
    >
      <StockRequestEditor
        branchId={branchId}
        requestId={requestId}
        ingredients={ingredients}
        initialLines={lines}
        initialStatus={request?.status ?? null}
        initialNeededAt={request?.needed_at ?? null}
        initialNotes={request?.notes ?? null}
        returnHref={`/inventory/transfers?branchId=${branchId}&requestId=:requestId`}
      />
    </DocumentFormFrame>
  );
}
