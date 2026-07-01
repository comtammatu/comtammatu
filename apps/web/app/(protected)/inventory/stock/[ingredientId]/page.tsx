import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  ClipboardList as IconClipboardList,
  PackageCheck as IconPackageCheck,
  Receipt as IconReceipt,
  Trash as IconTrash,
  Truck as IconTruck,
} from "lucide-react";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermission } from "@/_lib/permissions";
import { getStatusBadgeMeta } from "@/components/status-badge";
import {
  AppEmptyState,
  AppPageHeader,
  AppSection,
  DescriptionList,
} from "@/components/surface";
import { messages } from "@lib/messages";
import { InventoryPageContent } from "../../_components/inventory-page-layout";
import {
  formatDate,
  formatDateTime,
  formatQty,
  formatVND,
} from "../../_lib/format";
import {
  resolveInventoryBranchScope,
  resolveRequestedBranchId,
} from "../../_lib/inventory-scope";
import { fetchStockBearingLocationIds } from "../../_lib/stock-bearing-locations";

const stockCopy = messages.inventory.stock;
const inventoryCommon = messages.inventory.common;
const detailCopy = stockCopy.detail;

type StockStatus = "normal" | "low" | "out" | "over";
type MovementBadgeVariant = "success" | "destructive" | "secondary";

type IngredientRow = {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  purchase_unit: string;
  category: string | null;
  unit_cost: number | null;
  min_stock_level: number | null;
  max_stock_level: number | null;
  reorder_point: number | null;
  storage_type: string | null;
};

type LocationRef = {
  name: string;
  code: string;
  location_kind: string;
};

type StockLevelRow = {
  location_id: number;
  current_quantity: number;
  avg_unit_cost: number | null;
  last_counted_at: string | null;
  inventory_locations: LocationRef | LocationRef[] | null;
};

type MovementRow = {
  id: number;
  type: string;
  movement_subtype: string | null;
  quantity_change: number;
  unit_cost: number | null;
  reason: string | null;
  created_at: string;
  grn_id: number | null;
  transfer_id: number | null;
  issue_id: number | null;
  order_id: number | null;
  production_order_id: number | null;
  inventory_locations: LocationRef | LocationRef[] | null;
};

type GrnRef = {
  id: number;
  grn_number: string;
  received_date: string | null;
};

type ExpiryRow = {
  id: number;
  grn_id: number;
  batch_number: string | null;
  expiry_date: string | null;
  received_quantity: number;
  unit: string;
  goods_received_notes: GrnRef | GrnRef[] | null;
};

interface StockIngredientDetailPageContentProps {
  ingredientId: number;
  searchParams?: Promise<{ branchId?: string | string[] }>;
  routeBranchId?: number;
  branchStockBasePath?: string;
  embedded?: boolean;
}

function computeStatus(
  qty: number,
  min: number,
  reorder: number,
  max: number,
): StockStatus {
  if (qty <= 0) return "out";
  if (qty < min) return "low";
  if (max > 0 && qty > max) return "over";
  if (reorder > 0 && qty <= reorder) return "low";
  return "normal";
}

function storageTemp(type: string | null): string | null {
  if (type === "refrigerated") return "0-4°C";
  if (type === "frozen") return "-18°C";
  return null;
}

function relatedOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function branchHref(branchId: number, path: string): string {
  return `${path}?branchId=${branchId}`;
}

function branchStockHref(basePath: string, segment: string): string {
  return `${basePath}${segment}`;
}

function movementLabel(movement: MovementRow): string {
  if (movement.type === "grn_receipt") return stockCopy.movement.grnReceipt;
  if (movement.type === "transfer_in") return stockCopy.movement.transferIn;
  if (movement.type === "transfer_out") return stockCopy.movement.transferOut;
  if (movement.type === "production_consumption")
    return stockCopy.movement.productionConsumption;
  if (movement.type === "production_output")
    return stockCopy.movement.productionOutput;
  if (movement.type === "count_adjustment")
    return stockCopy.movement.countAdjustment;
  if (movement.type === "adjustment") return stockCopy.movement.adjustment;
  if (movement.type === "consumption") {
    if (movement.movement_subtype === "storage_loss")
      return stockCopy.movement.storageLoss;
    if (movement.movement_subtype === "sale_consumption")
      return stockCopy.movement.saleConsumption;
    if (movement.movement_subtype === "writeoff")
      return stockCopy.movement.writeoff;
    if (movement.movement_subtype === "other") return stockCopy.movement.other;
    return stockCopy.movement.issueStock;
  }
  if (movement.type === "writeoff") return stockCopy.movement.writeoff;
  return movement.type.replaceAll("_", " ");
}

function movementVariant(quantityChange: number): MovementBadgeVariant {
  if (quantityChange > 0) return "success";
  if (quantityChange < 0) return "destructive";
  return "secondary";
}

function movementReferenceLabel(movement: MovementRow): string | null {
  if (movement.grn_id != null) return `GRN #${movement.grn_id}`;
  if (movement.transfer_id != null)
    return stockCopy.movement.transferRef(movement.transfer_id);
  if (movement.issue_id != null)
    return stockCopy.movement.issueRef(movement.issue_id);
  if (movement.production_order_id != null)
    return stockCopy.movement.productionRef(movement.production_order_id);
  if (movement.order_id != null)
    return stockCopy.movement.orderRef(movement.order_id);
  return null;
}

function movementReferenceHref({
  movement,
  branchId,
  branchStockBasePath,
  embedded,
}: {
  movement: MovementRow;
  branchId: number;
  branchStockBasePath: string;
  embedded: boolean;
}): string | null {
  if (embedded) {
    if (movement.grn_id != null)
      return branchStockHref(branchStockBasePath, "/receive");
    if (movement.transfer_id != null)
      return branchStockHref(
        branchStockBasePath,
        `/transfer/${movement.transfer_id}`,
      );
    if (movement.issue_id != null)
      return branchStockHref(
        branchStockBasePath,
        `/issues/${movement.issue_id}`,
      );
    return null;
  }
  if (movement.grn_id != null) return `/inventory/grn/${movement.grn_id}`;
  if (movement.transfer_id != null)
    return `/inventory/transfers/${movement.transfer_id}`;
  if (movement.issue_id != null)
    return `/inventory/issues/${movement.issue_id}`;
  return branchHref(branchId, "/inventory/reports");
}

function StockMetric({ label, value }: { label: string; value: string }) {
  return (
    <AppSection size="sm" contentClassName="gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-lg font-semibold tabular-nums">
        {value}
      </span>
    </AppSection>
  );
}

export async function StockIngredientDetailPageContent({
  ingredientId,
  searchParams,
  routeBranchId,
  branchStockBasePath,
  embedded = false,
}: StockIngredientDetailPageContentProps) {
  if (!Number.isInteger(ingredientId) || ingredientId <= 0) notFound();

  const { supabase, claims } = await loadAuthState();
  const params = searchParams ? await searchParams : {};
  const requested =
    routeBranchId ?? (await resolveRequestedBranchId(params.branchId));
  const scope = await resolveInventoryBranchScope(supabase, claims, requested);
  if (routeBranchId != null && scope.selectedBranchId !== routeBranchId) {
    notFound();
  }

  const branchId = scope.selectedBranchId;
  if (!branchId) redirect("/inventory");

  const branchStockRoot = branchStockBasePath ?? `/br/${branchId}/stock`;
  const listHref = embedded
    ? branchStockHref(branchStockRoot, "/on-hand")
    : branchHref(branchId, "/inventory/stock");
  const actionHrefs = embedded
    ? {
        receive: branchStockHref(branchStockRoot, "/receive"),
        transfer: branchStockHref(branchStockRoot, "/transfer"),
        stocktake: branchStockHref(branchStockRoot, "/count"),
        issues: branchStockHref(branchStockRoot, "/issues"),
        waste: branchStockHref(branchStockRoot, "/waste"),
      }
    : {
        receive: branchHref(branchId, "/inventory/grn"),
        transfer: branchHref(branchId, "/inventory/transfers"),
        stocktake: branchHref(branchId, "/inventory/stocktake"),
        issues: "/inventory/issues",
        waste: branchHref(branchId, "/inventory/waste/new"),
      };

  const [
    stockBearingLocationIds,
    ingredientRes,
    canReceiveGrn,
    canCreateTransfer,
    canCreateStocktake,
    canCreateIssue,
    canWriteoff,
  ] = await Promise.all([
    fetchStockBearingLocationIds({
      supabase,
      tenantId: claims.tenant_id,
      branchId,
    }),
    supabase
      .from("ingredients")
      .select(
        "id, name, sku, unit, purchase_unit, category, unit_cost, min_stock_level, max_stock_level, reorder_point, storage_type",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("id", ingredientId)
      .maybeSingle(),
    currentUserHasPermission(branchId, PERMISSION_KEYS.PROCUREMENT_GRN_CREATE),
    currentUserHasPermission(
      branchId,
      PERMISSION_KEYS.INVENTORY_TRANSFER_CREATE,
    ),
    currentUserHasPermission(
      branchId,
      PERMISSION_KEYS.INVENTORY_STOCKTAKE_CREATE,
    ),
    currentUserHasPermission(branchId, PERMISSION_KEYS.INVENTORY_WRITE),
    currentUserHasPermission(branchId, PERMISSION_KEYS.INVENTORY_WRITEOFF),
  ]);

  if (ingredientRes.error || !ingredientRes.data) notFound();
  const ingredient = ingredientRes.data as IngredientRow;

  const [stockRes, movementRes, expiryRes] = await Promise.all([
    stockBearingLocationIds.length > 0
      ? supabase
          .from("stock_levels")
          .select(
            "location_id, current_quantity, avg_unit_cost, last_counted_at, inventory_locations ( name, code, location_kind )",
          )
          .eq("tenant_id", claims.tenant_id)
          .eq("branch_id", branchId)
          .eq("ingredient_id", ingredientId)
          .in("location_id", stockBearingLocationIds)
          .order("location_id")
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("stock_movements")
      .select(
        "id, type, movement_subtype, quantity_change, unit_cost, reason, created_at, grn_id, transfer_id, issue_id, order_id, production_order_id, inventory_locations ( name, code, location_kind )",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("ingredient_id", ingredientId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("grn_items")
      .select(
        "id, grn_id, batch_number, expiry_date, received_quantity, unit, goods_received_notes!inner ( id, grn_number, branch_id, status, received_date )",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("ingredient_id", ingredientId)
      .eq("goods_received_notes.branch_id", branchId)
      .eq("goods_received_notes.status", "confirmed")
      .not("expiry_date", "is", null)
      .order("expiry_date", { ascending: true })
      .limit(8),
  ]);

  const stockRows = (stockRes.data ?? []) as StockLevelRow[];
  const movementRows = (movementRes.data ?? []) as MovementRow[];
  const expiryRows = (expiryRes.data ?? []) as ExpiryRow[];
  const unit = ingredient.purchase_unit || ingredient.unit;
  const totalQty = stockRows.reduce(
    (sum, row) => sum + Number(row.current_quantity ?? 0),
    0,
  );
  const totalValue = stockRows.reduce((sum, row) => {
    const qty = Number(row.current_quantity ?? 0);
    const cost = Number(row.avg_unit_cost ?? ingredient.unit_cost ?? 0);
    return sum + qty * cost;
  }, 0);
  const wac =
    totalQty > 0 ? totalValue / totalQty : Number(ingredient.unit_cost ?? 0);
  const latestCount = stockRows.reduce<string | null>((latest, row) => {
    if (!row.last_counted_at) return latest;
    if (!latest) return row.last_counted_at;
    return row.last_counted_at > latest ? row.last_counted_at : latest;
  }, null);
  const min = Number(ingredient.min_stock_level ?? 0);
  const max = Number(ingredient.max_stock_level ?? 0);
  const reorder = Number(ingredient.reorder_point ?? 0);
  const status = computeStatus(totalQty, min, reorder, max);
  const statusBadge = getStatusBadgeMeta("inventory", status);
  const temperature = storageTemp(ingredient.storage_type);

  return (
    <InventoryPageContent width="wide" scroll>
      <AppPageHeader
        eyebrow={detailCopy.eyebrow}
        title={ingredient.name}
        description={[
          ingredient.sku ? ingredient.sku : null,
          ingredient.category,
          unit,
        ]
          .filter(Boolean)
          .join(" · ")}
        badge={{
          children: statusBadge.label,
          variant: statusBadge.variant,
        }}
        breadcrumb={
          <Link
            href={listHref}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:underline"
          >
            <IconArrowLeft className="size-4" />
            {detailCopy.backToStock}
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="flex flex-col gap-3 lg:col-span-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StockMetric
              label={stockCopy.table.currentStock}
              value={`${formatQty(totalQty)} ${unit}`}
            />
            <StockMetric
              label={stockCopy.table.stockValue}
              value={formatVND(totalValue)}
            />
            <StockMetric
              label={stockCopy.table.wac}
              value={wac > 0 ? formatVND(wac) : inventoryCommon.noValue}
            />
            <StockMetric
              label={stockCopy.table.lastCount}
              value={
                latestCount ? formatDate(latestCount) : inventoryCommon.noValue
              }
            />
          </div>

          <AppSection
            title={detailCopy.locationTitle}
            description={detailCopy.locationDescription}
            icon={<IconPackageCheck />}
          >
            {stockRows.length === 0 ? (
              <AppEmptyState
                compact
                mode="no-data"
                title={detailCopy.noLocationStockTitle}
                description={detailCopy.noLocationStockDescription}
              />
            ) : (
              <div className="flex flex-col gap-2">
                {stockRows.map((row) => {
                  const location = relatedOne(row.inventory_locations);
                  const qty = Number(row.current_quantity ?? 0);
                  const cost = Number(
                    row.avg_unit_cost ?? ingredient.unit_cost ?? 0,
                  );

                  return (
                    <Item
                      key={row.location_id}
                      variant="outline"
                      className="flex-col items-stretch gap-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">
                          {location?.name ?? `#${row.location_id}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {location?.code ?? inventoryCommon.noValue}
                          {location?.location_kind
                            ? ` · ${detailCopy.locationKind}: ${location.location_kind}`
                            : ""}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm sm:min-w-64">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {FORM_VI.quantity}
                          </p>
                          <p className="font-mono font-semibold tabular-nums">
                            {formatQty(qty)} {unit}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">
                            {FORM_VI.value}
                          </p>
                          <p className="font-mono font-semibold tabular-nums">
                            {formatVND(qty * cost)}
                          </p>
                        </div>
                      </div>
                    </Item>
                  );
                })}
              </div>
            )}
          </AppSection>

          <AppSection
            title={detailCopy.movementTitle}
            headerHint={detailCopy.movementHint(movementRows.length)}
            icon={<IconClipboardList />}
          >
            {movementRows.length === 0 ? (
              <AppEmptyState
                compact
                mode="no-data"
                title={detailCopy.noMovementTitle}
                description={detailCopy.noMovementDescription}
              />
            ) : (
              <div className="flex flex-col gap-2">
                {movementRows.map((movement) => {
                  const signedQty =
                    movement.quantity_change > 0
                      ? `+${formatQty(movement.quantity_change)}`
                      : formatQty(movement.quantity_change);
                  const referenceLabel = movementReferenceLabel(movement);
                  const referenceHref = movementReferenceHref({
                    movement,
                    branchId,
                    branchStockBasePath: branchStockRoot,
                    embedded,
                  });
                  const location = relatedOne(movement.inventory_locations);

                  return (
                    <Item
                      key={movement.id}
                      variant="outline"
                      className="flex-col items-stretch gap-2 text-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {movementLabel(movement)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(movement.created_at)}
                            {location?.name ? ` · ${location.name}` : ""}
                          </p>
                        </div>
                        <Badge
                          variant={movementVariant(movement.quantity_change)}
                          className="shrink-0"
                        >
                          {signedQty} {unit}
                        </Badge>
                      </div>
                      {referenceLabel ||
                      movement.reason ||
                      movement.unit_cost != null ? (
                        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                          {referenceLabel ? (
                            <p>
                              {detailCopy.reference}:{" "}
                              {referenceHref ? (
                                <Link
                                  href={referenceHref}
                                  className="font-medium text-primary hover:underline"
                                >
                                  {referenceLabel}
                                </Link>
                              ) : (
                                <span>{referenceLabel}</span>
                              )}
                            </p>
                          ) : null}
                          {movement.reason ? (
                            <p className="break-words">{movement.reason}</p>
                          ) : null}
                          {movement.unit_cost != null ? (
                            <p>
                              {stockCopy.table.wac}:{" "}
                              {formatVND(movement.unit_cost)}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </Item>
                  );
                })}
              </div>
            )}
          </AppSection>
        </div>

        <div className="flex flex-col gap-3">
          <AppSection title={detailCopy.operationTitle}>
            <div className="grid grid-cols-2 gap-2">
              {canReceiveGrn ? (
                <Button asChild size="sm">
                  <Link href={actionHrefs.receive}>
                    <IconReceipt className="size-3.5" />
                    {stockCopy.actions.receiveGoods}
                  </Link>
                </Button>
              ) : null}
              {canCreateTransfer ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={actionHrefs.transfer}>
                    <IconTruck className="size-3.5" />
                    {stockCopy.actions.transfer}
                  </Link>
                </Button>
              ) : null}
              {canCreateStocktake ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={actionHrefs.stocktake}>
                    <IconClipboardList className="size-3.5" />
                    {stockCopy.actions.stocktake}
                  </Link>
                </Button>
              ) : null}
              {canCreateIssue ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={actionHrefs.issues}>
                    <IconTruck className="size-3.5" />
                    {stockCopy.actions.issueStock}
                  </Link>
                </Button>
              ) : null}
              {canWriteoff ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={actionHrefs.waste}>
                    <IconTrash className="size-3.5" />
                    {stockCopy.actions.waste}
                  </Link>
                </Button>
              ) : null}
            </div>
          </AppSection>

          <AppSection title={detailCopy.thresholdTitle}>
            <DescriptionList
              items={[
                {
                  term: stockCopy.table.currentStock,
                  description: `${formatQty(totalQty)} ${unit}`,
                },
                {
                  term: stockCopy.table.minThreshold,
                  description: formatQty(min),
                },
                { term: "Reorder", description: formatQty(reorder) },
                {
                  term: "Max",
                  description:
                    max > 0 ? formatQty(max) : inventoryCommon.noValue,
                },
                {
                  term: detailCopy.storage,
                  description: temperature ?? inventoryCommon.noValue,
                },
              ]}
            />
          </AppSection>

          {expiryRows.length > 0 ? (
            <AppSection
              title={detailCopy.expiryTitle}
              description={detailCopy.expiryDescription}
            >
              <div className="flex flex-col gap-2">
                {expiryRows.map((row) => {
                  const grn = relatedOne(row.goods_received_notes);
                  const sourceHref = embedded
                    ? actionHrefs.receive
                    : grn
                      ? `/inventory/grn/${grn.id}`
                      : actionHrefs.receive;

                  return (
                    <Item
                      key={row.id}
                      variant="outline"
                      className="flex-col items-stretch gap-1 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">
                          {row.batch_number ?? detailCopy.noBatch}
                        </p>
                        <Badge variant="outline">
                          {row.expiry_date
                            ? formatDate(row.expiry_date)
                            : inventoryCommon.noValue}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {detailCopy.received}:{" "}
                        {formatQty(row.received_quantity)} {row.unit}
                      </p>
                      <Link
                        href={sourceHref}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        {grn?.grn_number ?? detailCopy.sourceHub}
                      </Link>
                    </Item>
                  );
                })}
              </div>
            </AppSection>
          ) : null}

          <Button asChild variant="ghost" className="justify-start">
            <Link href={listHref}>
              <IconArrowLeft className="size-4" />
              {ACTIONS_VI.back}
            </Link>
          </Button>
        </div>
      </div>
    </InventoryPageContent>
  );
}

export default async function StockIngredientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ ingredientId: string }>;
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const { ingredientId: rawIngredientId } = await params;
  const ingredientId = Number(rawIngredientId);
  if (!Number.isInteger(ingredientId) || ingredientId <= 0) notFound();

  return (
    <StockIngredientDetailPageContent
      ingredientId={ingredientId}
      searchParams={searchParams}
    />
  );
}
