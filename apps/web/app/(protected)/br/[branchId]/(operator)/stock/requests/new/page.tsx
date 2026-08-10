import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import {
  BranchOperatorControlBar,
  BranchOperatorPage,
} from "@lib/branch-operator/components/branch-operator-page";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";
import {
  StockRequestEditor,
  type StockRequestEditorLine,
  type StockRequestIngredientOption,
} from "./stock-request-editor";
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

export default async function BranchStockRequestNewPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ requestId?: string; copyFromId?: string }>;
}) {
  const [{ branchId: raw }, query] = await Promise.all([params, searchParams]);
  const branchId = parseOperatorBranchId(raw);
  if (branchId == null) notFound();

  const { supabase, claims } = await loadAuthState();
  const branchContext = await resolveBranchContext(supabase, claims, branchId);
  if (!branchContext) notFound();

  const kind = branchContext.branch.branch_kind;
  if (kind === "central_supply") {
    notFound();
  }
  if (kind !== "branch" && kind !== "central_kitchen") {
    notFound();
  }

  const requestId = Number(query.requestId);
  const copyFromIdRaw = Number(query.copyFromId);
  const editing =
    Number.isInteger(requestId) && requestId > 0 ? requestId : null;
  const copyFromId =
    editing == null &&
    Number.isInteger(copyFromIdRaw) &&
    copyFromIdRaw > 0
      ? copyFromIdRaw
      : null;
  const sourceRequestId = editing ?? copyFromId;

  const ingredientsQuery =
    kind === "central_kitchen"
      ? supabase
          .from("ingredients")
          .select(
            "id, name, sku, min_stock_level, default_fulfill_site_kind, ingredient_units!ingredient_units_ingredient_tenant_fkey(unit_id, is_base, is_active, sort_order, units!ingredient_units_unit_tenant_fkey(code, name))",
          )
          .eq("tenant_id", claims.tenant_id)
          .eq("is_active", true)
          .eq("default_fulfill_site_kind", "central_supply")
          .order("name")
      : supabase
          .from("ingredients")
          .select(
            "id, name, sku, min_stock_level, default_fulfill_site_kind, ingredient_units!ingredient_units_ingredient_tenant_fkey(unit_id, is_base, is_active, sort_order, units!ingredient_units_unit_tenant_fkey(code, name))",
          )
          .eq("tenant_id", claims.tenant_id)
          .eq("is_active", true)
          .not("default_fulfill_site_kind", "is", null)
          .order("name");

  const [ingredientsResult, requestResult] = await Promise.all([
    ingredientsQuery,
    sourceRequestId == null
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from("stock_requests")
          .select("id, status, needed_at, notes")
          .eq("tenant_id", claims.tenant_id)
          .eq("branch_id", branchId)
          .eq("id", sourceRequestId)
          .maybeSingle(),
  ]);
  if (ingredientsResult.error || requestResult.error) {
    throw new Error("inventory.stock_request_editor.load_failed");
  }
  const ingredientRows = ingredientsResult.data;

  const request = requestResult.data as unknown as {
    id: number;
    status: string;
    needed_at: string | null;
    notes: string | null;
  } | null;
  if (
    editing != null &&
    (!request || !["draft", "submitted"].includes(request.status))
  ) {
    notFound();
  }
  if (copyFromId != null && !request) {
    notFound();
  }

  const ingredientJoins = (ingredientRows ?? []) as IngredientJoin[];
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
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((unit) => ({
          id: unit.unit_id,
          label: unit.units?.name ?? unit.units?.code ?? "",
          isBase: unit.is_base,
        })),
    }),
  );

  const itemsResult =
    sourceRequestId == null
      ? { data: [], error: null }
      : await supabase
          .from("stock_request_items")
          .select("id, ingredient_id, entry_unit_id, quantity, status")
          .eq("tenant_id", claims.tenant_id)
          .eq("request_id", sourceRequestId)
          .order("id");
  if (itemsResult.error) {
    throw new Error("inventory.stock_request_editor.load_failed");
  }
  const itemRows = itemsResult.data ?? [];
  if (editing != null && itemRows.some((item) => item.status !== "pending")) {
    notFound();
  }
  if (
    copyFromId != null &&
    !itemRows.some((item) => item.status === "rejected")
  ) {
    notFound();
  }
  const lines: StockRequestEditorLine[] = (
    copyFromId != null
      ? itemRows.filter(
          (item) =>
            item.status === "rejected" || item.status === "pending",
        )
      : itemRows
  ).map((item) => ({
    ...(editing != null ? { id: item.id } : {}),
    ingredientId: item.ingredient_id,
    entryUnitId: item.entry_unit_id,
    quantity: Number(item.quantity),
  }));

  const journeyCopy = messages.inventory.stockRequests.journey;
  const branchCopy = messages.inventory.stockRequests.branch;
  const isCentralKitchen = kind === "central_kitchen";
  const pageTitle = isCentralKitchen
    ? journeyCopy.centralSupplyRequestAction
    : copyFromId != null
      ? "Yêu cầu hàng mới"
      : editing == null
        ? "Yêu cầu hàng"
        : "Sửa yêu cầu hàng";
  const pageDescription =
    copyFromId != null
      ? branchCopy.copyToNewBanner
      : isCentralKitchen
        ? journeyCopy.centralSupplyRequestDescription(branchContext.branch.name)
        : "Kho Tổng hoặc Bếp Trung Tâm tiếp nhận theo từng nguyên liệu.";
  const backHref =
    kind === "branch"
      ? `/br/${branchId}/stock`
      : `/br/${branchId}/stock/transfer`;

  return (
    <BranchOperatorPage
      title={pageTitle}
      description={pageDescription}
      hideHeaderOnMobile
    >
      <BranchOperatorControlBar className="sm:hidden">
        <Button
          variant="ghost"
          size="icon-touch"
          render={<Link href={backHref} aria-label={ACTIONS_VI.back} />}
        >
          <IconArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{pageTitle}</p>
          <p className="truncate text-xs text-muted-foreground">
            {pageDescription}
          </p>
        </div>
      </BranchOperatorControlBar>
      <StockRequestEditor
        branchId={branchId}
        requestId={editing}
        ingredients={ingredients}
        initialLines={lines}
        initialStatus={editing != null ? (request?.status ?? null) : null}
        initialNeededAt={request?.needed_at ?? null}
        initialNotes={
          copyFromId != null
            ? null
            : (request?.notes ?? null)
        }
        copyFromRequestId={copyFromId}
        returnHref={
          isCentralKitchen
            ? `/br/${branchId}/stock/transfer?requestId=:requestId`
            : kind === "branch"
              ? `/br/${branchId}/stock?requestId=:requestId`
              : undefined
        }
      />
    </BranchOperatorPage>
  );
}
