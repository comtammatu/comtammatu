"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { formatVNDate } from "@comtammatu/shared/time";
import {
  ArrowRightToLine as IconArrowBarRight,
  CalendarClock as IconCalendarClock,
  ClipboardList as IconClipboardList,
  Pencil as IconPencil,
  Receipt as IconReceipt,
  Search as IconSearch,
  ShoppingCart as IconShoppingCart,
  Trash as IconTrash,
  Truck as IconTruck,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { cn } from "@comtammatu/ui";
import { messages } from "@lib/messages";
import { matchesSearch } from "@lib/search";
import {
  FormDialog,
  NumberField,
  SelectField,
  TextareaField,
  TextField,
} from "@/components/form";
import { AppEmptyState, AppPageHeader, AppSection } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  InventoryFilterBar,
  InventoryPageContent,
} from "../_components/inventory-page-layout";
import { StatusBadge } from "@/components/status-badge";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { formatDateTime, formatQty, formatVND } from "../_lib/format";
import { CATEGORY_TONE_CLASS } from "../_lib/constants";
import { createStockIssueDraft, upsertStockIssueLine } from "../issue-actions";
import { AdjustStockDialog } from "./adjust-stock-dialog";

import { ACTIONS_VI, FORM_VI, PRODUCT_VI } from "@comtammatu/shared/messages";

const stockCopy = messages.inventory.stock;
const inventoryCommon = messages.inventory.common;

export type StockIngredient = {
  id: number;
  name: string;
  sku: string;
  unit: string;
  category: string;
  qty: number;
  cost: number;
  min: number;
  max: number;
  reorder: number;
  status: "normal" | "low" | "out" | "over";
  lastCount: string;
  temp: string | null;
};

export type StockWorkSummary = {
  underThresholdCount: number;
  expiryCount: number;
  pendingGrnCount: number;
  pendingTransferCount: number;
  pendingWorkCount: number;
};

export type StockActionPermissions = {
  canReceiveGrn: boolean;
  canReceiveTransfer: boolean;
  canCreateIssue: boolean;
  canCreateTransfer: boolean;
  canCreateStocktake: boolean;
  canWriteoff: boolean;
  canCreatePurchaseOrder: boolean;
  canAdjustException: boolean;
};

export type StockMovementHistory = {
  id: number;
  ingredientId: number;
  type: string;
  movementSubtype: string | null;
  quantityChange: number;
  unitCost: number | null;
  reason: string | null;
  createdAt: string;
  grnId: number | null;
  transferId: number | null;
  issueId: number | null;
  orderId: number | null;
  productionOrderId: number | null;
};

type StockFilter = "all" | "in_stock" | "low" | "out";
type RiskFilter = "all" | "reorder" | "not_counted";
type SortMode = "priority" | "name" | "value_desc";
type MovementBadgeVariant = "success" | "destructive" | "secondary";
type QuickIssueType = "consumption" | "writeoff" | "other";
type QuickIssueTarget = {
  ingredient: StockIngredient;
  issueType: QuickIssueType;
};

const stockFilterOptions: { value: StockFilter; label: string }[] = [
  { value: "all", label: stockCopy.filters.all },
  { value: "in_stock", label: stockCopy.filters.inStock },
  { value: "low", label: stockCopy.filters.low },
  { value: "out", label: stockCopy.filters.out },
];

const riskFilterOptions: { value: RiskFilter; label: string }[] = [
  { value: "all", label: stockCopy.filters.allRisk },
  { value: "reorder", label: stockCopy.filters.reorder },
  { value: "not_counted", label: stockCopy.filters.notCounted },
];

const sortOptions: { value: SortMode; label: string }[] = [
  { value: "priority", label: stockCopy.filters.priority },
  { value: "name", label: stockCopy.filters.name },
  { value: "value_desc", label: stockCopy.filters.valueDesc },
];

const quickIssueTypeOptions: {
  value: QuickIssueType;
  label: string;
  reasonPlaceholder: string;
}[] = [
  {
    value: "consumption",
    label: stockCopy.quickIssue.options.consumption,
    reasonPlaceholder: stockCopy.quickIssue.placeholders.consumption,
  },
  {
    value: "writeoff",
    label: stockCopy.quickIssue.options.writeoff,
    reasonPlaceholder: stockCopy.quickIssue.placeholders.writeoff,
  },
  {
    value: "other",
    label: stockCopy.quickIssue.options.other,
    reasonPlaceholder: stockCopy.quickIssue.placeholders.other,
  },
];

function createQuickIssueSchema(maxQuantity: number) {
  return z.object({
    issueType: z.enum(["consumption", "writeoff", "other"]),
    quantity: z
      .string()
      .refine((value) => Number(value) > 0, {
        error: stockCopy.quickIssue.quantityPositive,
      })
      .refine((value) => Number(value) <= maxQuantity, {
        error: stockCopy.quickIssue.quantityExceedsStock,
      }),
    unit: z
      .string()
      .trim()
      .min(1, { error: stockCopy.quickIssue.unitRequired }),
    reason: z
      .string()
      .trim()
      .min(1, { error: stockCopy.quickIssue.reasonRequired }),
  });
}

type QuickIssueFormValues = z.infer<ReturnType<typeof createQuickIssueSchema>>;

const STATUS_PRIORITY: Record<StockIngredient["status"], number> = {
  out: 0,
  low: 1,
  over: 2,
  normal: 3,
};

const STOCK_COMPACT_QUERY = "(max-width: 1023px)";

function subscribeStockCompactLayout(callback: () => void) {
  const media = window.matchMedia(STOCK_COMPACT_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getStockCompactLayoutSnapshot() {
  return window.matchMedia(STOCK_COMPACT_QUERY).matches;
}

function getStockCompactLayoutServerSnapshot() {
  return false;
}

function useStockCompactLayout() {
  return useSyncExternalStore(
    subscribeStockCompactLayout,
    getStockCompactLayoutSnapshot,
    getStockCompactLayoutServerSnapshot,
  );
}

function branchHref(branchId: number, path: string): string {
  return `${path}?branchId=${branchId}`;
}

function branchStockHref(basePath: string, segment: string): string {
  return `${basePath}${segment}`;
}

function stockValue(item: StockIngredient): number {
  return item.qty * item.cost;
}

function isReorderRisk(item: StockIngredient): boolean {
  return (
    item.status === "out" || item.status === "low" || item.qty <= item.reorder
  );
}

function movementLabel(movement: StockMovementHistory): string {
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
    if (movement.movementSubtype === "storage_loss")
      return stockCopy.movement.storageLoss;
    if (movement.movementSubtype === "sale_consumption")
      return stockCopy.movement.saleConsumption;
    if (movement.movementSubtype === "writeoff")
      return stockCopy.movement.writeoff;
    if (movement.movementSubtype === "other") return stockCopy.movement.other;
    return stockCopy.movement.issueStock;
  }
  if (movement.type === "writeoff") return stockCopy.movement.writeoff;
  return movement.type.replaceAll("_", " ");
}

function movementReference(movement: StockMovementHistory): string | null {
  if (movement.grnId != null) return `GRN #${movement.grnId}`;
  if (movement.transferId != null)
    return stockCopy.movement.transferRef(movement.transferId);
  if (movement.issueId != null)
    return stockCopy.movement.issueRef(movement.issueId);
  if (movement.productionOrderId != null)
    return stockCopy.movement.productionRef(movement.productionOrderId);
  if (movement.orderId != null)
    return stockCopy.movement.orderRef(movement.orderId);
  return null;
}

function movementVariant(quantityChange: number): MovementBadgeVariant {
  if (quantityChange > 0) return "success";
  if (quantityChange < 0) return "destructive";
  return "secondary";
}

function SummaryMetric({
  label,
  value,
  tone = "default",
  onClick,
  active,
}: {
  label: string;
  value: string;
  tone?: "default" | "warning" | "muted";
  onClick?: () => void;
  active?: boolean;
}) {
  const content = (
    <>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          tone === "warning" && "text-destructive",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex min-w-fit items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40",
          active && "bg-primary/10",
        )}
        aria-pressed={active}
      >
        {content}
      </button>
    );
  }

  return (
    <div className="flex min-w-fit items-center gap-2 px-3 py-2">{content}</div>
  );
}

function QuickActionButton({
  href,
  icon: Icon,
  label,
  primary,
}: {
  href: string;
  icon: typeof IconReceipt;
  label: string;
  primary?: boolean;
}) {
  return (
    <Button asChild size="sm" variant={primary ? "default" : "outline"}>
      <Link href={href}>
        <Icon className="size-3.5" />
        {label}
      </Link>
    </Button>
  );
}

function QuickStockIssueDialog({
  branchId,
  open,
  target,
  issueBasePath = "/inventory/issues",
  onOpenChange,
}: {
  branchId: number;
  open: boolean;
  target: QuickIssueTarget;
  issueBasePath?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const schema = useMemo(
    () => createQuickIssueSchema(target.ingredient.qty),
    [target.ingredient.qty],
  );
  const defaultValues = useMemo<QuickIssueFormValues>(
    () => ({
      issueType: target.issueType,
      quantity: "",
      unit: target.ingredient.unit,
      reason: "",
    }),
    [target.ingredient.unit, target.issueType],
  );
  const title =
    target.issueType === "writeoff"
      ? stockCopy.quickIssue.writeoffTitle
      : stockCopy.quickIssue.issueTitle;

  async function handleSubmit(values: QuickIssueFormValues) {
    const draftRes = await createStockIssueDraft({
      branchId,
      issueType: values.issueType,
      notes: stockCopy.quickIssue.draftNotes(target.ingredient.name),
    });
    if (!draftRes.success || !draftRes.data) {
      return {
        success: false,
        error: draftRes.error ?? stockCopy.quickIssue.createDraftFailed,
      };
    }

    const issueId = Number((draftRes.data as { id: number }).id);
    const lineRes = await upsertStockIssueLine({
      issueId,
      ingredientId: target.ingredient.id,
      quantity: Number(values.quantity),
      unit: values.unit.trim(),
      reason: values.reason.trim(),
    });
    if (!lineRes.success) {
      router.push(`${issueBasePath}/${issueId}`);
      return {
        success: false,
        error: lineRes.error ?? stockCopy.quickIssue.addLineFailed,
      };
    }

    router.push(`${issueBasePath}/${issueId}`);
    return { success: true };
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      schema={schema}
      defaultValues={defaultValues}
      entityKey={`${target.ingredient.id}-${target.issueType}`}
      onSubmit={handleSubmit}
      successMessage={stockCopy.quickIssue.created(target.ingredient.name)}
      submitLabel={stockCopy.quickIssue.createSlip}
      cancelLabel={ACTIONS_VI.cancel}
      contentClassName="sm:max-w-md"
    >
      {(form) => {
        const activeIssueType = quickIssueTypeOptions.find(
          (option) => option.value === form.watch("issueType"),
        );
        return (
          <>
            <div className="rounded-md border bg-muted/20 px-3 py-2">
              <p className="font-medium">{target.ingredient.name}</p>
              <p className="text-xs text-muted-foreground">
                {stockCopy.quickIssue.stockLine(
                  target.ingredient.sku,
                  target.ingredient.category,
                  formatQty(target.ingredient.qty),
                  target.ingredient.unit,
                )}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField
                control={form.control}
                name="quantity"
                label={FORM_VI.quantity}
                maxFractionDigits={3}
                placeholder="0"
                required
              />
              <TextField
                control={form.control}
                name="unit"
                label={FORM_VI.unit}
                readOnly
                aria-readonly="true"
              />
            </div>

            <SelectField
              control={form.control}
              name="issueType"
              label={stockCopy.quickIssue.operation}
              options={quickIssueTypeOptions}
            />
            <TextareaField
              control={form.control}
              name="reason"
              label={FORM_VI.reason}
              rows={3}
              placeholder={activeIssueType?.reasonPlaceholder}
              required
            />
          </>
        );
      }}
    </FormDialog>
  );
}

export function StockClient({
  ingredients,
  branchId,
  branchValue,
  totalValue,
  summary,
  permissions,
  movementHistory,
  branchStockBasePath,
  embedded = false,
}: {
  ingredients: StockIngredient[];
  branchId: number;
  branchValue: number | null;
  totalValue: number | null;
  summary: StockWorkSummary;
  permissions: StockActionPermissions;
  movementHistory: StockMovementHistory[];
  branchStockBasePath?: string;
  embedded?: boolean;
}) {
  const router = useRouter();
  const isCompactLayout = useStockCompactLayout();
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("priority");
  const [selectedId, setSelectedId] = useState<number | null>(
    ingredients[0]?.id ?? null,
  );
  const [adjustTarget, setAdjustTarget] = useState<StockIngredient | null>(
    null,
  );
  const [quickIssueTarget, setQuickIssueTarget] =
    useState<QuickIssueTarget | null>(null);

  const categories = useMemo(() => {
    const values = [
      ...new Set(
        ingredients.map((ingredient) => ingredient.category).filter(Boolean),
      ),
    ];
    values.sort((left, right) => left.localeCompare(right, "vi"));
    return values;
  }, [ingredients]);

  const filtered = useMemo(() => {
    let result = ingredients;

    if (activeCategory !== "all") {
      result = result.filter(
        (ingredient) => ingredient.category === activeCategory,
      );
    }

    if (stockFilter === "in_stock") {
      result = result.filter(
        (ingredient) =>
          ingredient.status === "normal" || ingredient.status === "over",
      );
    } else if (stockFilter === "low") {
      result = result.filter((ingredient) => ingredient.status === "low");
    } else if (stockFilter === "out") {
      result = result.filter((ingredient) => ingredient.status === "out");
    }

    if (riskFilter === "reorder") {
      result = result.filter(isReorderRisk);
    } else if (riskFilter === "not_counted") {
      result = result.filter((ingredient) => ingredient.lastCount === "—");
    }

    if (searchQuery.trim()) {
      result = result.filter((ingredient) =>
        matchesSearch([ingredient.name, ingredient.sku], searchQuery),
      );
    }

    const sorted = [...result];
    if (sortMode === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name, "vi"));
    } else if (sortMode === "value_desc") {
      sorted.sort((a, b) => stockValue(b) - stockValue(a));
    } else {
      sorted.sort(
        (a, b) =>
          STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] ||
          Number(isReorderRisk(b)) - Number(isReorderRisk(a)) ||
          a.name.localeCompare(b.name, "vi"),
      );
    }

    return sorted;
  }, [
    ingredients,
    activeCategory,
    stockFilter,
    riskFilter,
    searchQuery,
    sortMode,
  ]);

  const filtersActive =
    searchQuery.trim() !== "" ||
    activeCategory !== "all" ||
    stockFilter !== "all" ||
    riskFilter !== "all";

  // Pristine first-load: ingredients exist in catalog but no GRN has ever
  // happened for this branch. Suppress the 87/87 "Hết hàng" alarm storm
  // (real signal is "no data yet", not "stock-out emergency").
  const isFirstLoadEmpty =
    !filtersActive &&
    ingredients.length > 0 &&
    ingredients.every(
      (item) =>
        item.qty === 0 &&
        (!item.lastCount || item.lastCount === inventoryCommon.noValue),
    );

  const selected =
    filtered.find((ingredient) => ingredient.id === selectedId) ??
    filtered[0] ??
    null;
  const historyByIngredient = useMemo(() => {
    const history = new Map<number, StockMovementHistory[]>();
    for (const movement of movementHistory) {
      const list = history.get(movement.ingredientId) ?? [];
      if (list.length < 5) {
        list.push(movement);
        history.set(movement.ingredientId, list);
      }
    }
    return history;
  }, [movementHistory]);
  const selectedHistory = selected
    ? (historyByIngredient.get(selected.id) ?? [])
    : [];
  const filteredValue = filtered.reduce(
    (sum, item) => sum + stockValue(item),
    0,
  );
  const visibleTotalValue = branchValue ?? filteredValue;
  const liveLabel = formatVNDate(new Date());
  const stockRootPath = branchStockBasePath ?? `/br/${branchId}/stock`;
  const stockDetailHref = (ingredientId: number) =>
    embedded
      ? branchStockHref(stockRootPath, `/on-hand/${ingredientId}`)
      : branchHref(branchId, `/inventory/stock/${ingredientId}`);
  const actionHrefs = embedded
    ? {
        receive: branchStockHref(stockRootPath, "/receive"),
        transfer: branchStockHref(stockRootPath, "/transfer"),
        stocktake: branchStockHref(stockRootPath, "/stocktake"),
        expiry: branchStockHref(stockRootPath, "/expiry"),
        waste: branchStockHref(stockRootPath, "/waste"),
        purchaseSuggestion: branchStockHref(
          stockRootPath,
          "/purchase-orders/new",
        ),
        reports: branchStockHref(stockRootPath, "/reports"),
      }
    : {
        receive: branchHref(branchId, "/inventory/grn"),
        transfer: branchHref(branchId, "/inventory/transfers"),
        stocktake: branchHref(branchId, "/inventory/stocktake"),
        expiry: branchHref(branchId, "/inventory/expiry"),
        waste: branchHref(branchId, "/inventory/waste/new"),
        purchaseSuggestion: branchHref(
          branchId,
          "/inventory/purchase-orders/new",
        ),
        reports: branchHref(branchId, "/inventory/reports"),
      };
  const actionPermissions = permissions;
  const canReceiveStock = embedded
    ? actionPermissions.canReceiveTransfer
    : actionPermissions.canReceiveGrn;
  const receiveActionLabel = embedded
    ? stockCopy.actions.receive
    : stockCopy.actions.receiveGrn;
  const stockColumns: DataTableColumn<StockIngredient>[] = [
    {
      key: "ingredient",
      header: PRODUCT_VI.rawIngredient,
      className: "min-w-56",
      render: (item) => (
        <div className="flex flex-col gap-1">
          <p className="font-semibold">{item.name}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{item.sku}</span>
          </div>
        </div>
      ),
    },
    {
      key: "category",
      header: FORM_VI.category,
      className: "min-w-32",
      render: (item) =>
        item.category ? (
          <Badge
            className={
              CATEGORY_TONE_CLASS[item.category] ??
              "bg-muted text-muted-foreground"
            }
          >
            {item.category}
          </Badge>
        ) : (
          <span className="text-muted-foreground">
            {inventoryCommon.noValue}
          </span>
        ),
    },
    {
      key: "stock",
      header: stockCopy.table.stock,
      className: "min-w-24 text-right",
      render: (item) => (
        <span
          className={cn(
            "font-mono",
            (item.status === "low" || item.status === "out") &&
              "font-semibold text-destructive",
          )}
        >
          {formatQty(item.qty)} {item.unit}
        </span>
      ),
    },
    {
      key: "warning",
      header: stockCopy.table.warning,
      className: "min-w-40 text-right",
      render: (item) => (
        <div className="flex flex-wrap justify-end gap-2">
          <StatusBadge domain="inventory" value={item.status} size="sm" />
          {item.qty <= item.reorder ? (
            <Badge variant="warning">{stockCopy.filters.reorder}</Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: "wac",
      header: stockCopy.table.wac,
      className: "min-w-24 text-right",
      render: (item) => (
        <span className="font-mono">
          {item.cost > 0 ? formatVND(item.cost) : inventoryCommon.noValue}
        </span>
      ),
    },
    {
      key: "value",
      header: FORM_VI.value,
      className: "min-w-28 text-right",
      render: (item) => (
        <span className="font-mono font-semibold">
          {stockValue(item) > 0
            ? inventoryCommon.currencyCompact(formatVND(stockValue(item)))
            : inventoryCommon.noValue}
        </span>
      ),
    },
  ];

  const content = (
    <>
      <AppPageHeader
        title={stockCopy.title}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden sm:inline-flex">
              {liveLabel}
            </Badge>
            <Badge variant="success">Live</Badge>
          </div>
        }
      />
      <AppSection className="overflow-hidden" contentFlush>
        <div className="flex flex-wrap items-center divide-x">
          <SummaryMetric
            label={stockCopy.metrics.selectedWarehouse}
            value={inventoryCommon.currencyCompact(
              formatVND(visibleTotalValue),
            )}
          />
          {totalValue != null ? (
            <SummaryMetric
              label={stockCopy.metrics.wholeSystem}
              value={inventoryCommon.currencyCompact(formatVND(totalValue))}
            />
          ) : null}
          <SummaryMetric
            label={stockCopy.metrics.underThreshold}
            value={String(summary.underThresholdCount)}
            tone={summary.underThresholdCount > 0 ? "warning" : "muted"}
            onClick={
              summary.underThresholdCount > 0
                ? () => {
                    setStockFilter(stockFilter === "low" ? "all" : "low");
                  }
                : undefined
            }
            active={stockFilter === "low"}
          />
          <SummaryMetric
            label={stockCopy.metrics.nearExpiry}
            value={String(summary.expiryCount)}
            tone={summary.expiryCount > 0 ? "warning" : "muted"}
          />
          <SummaryMetric
            label={stockCopy.metrics.pending}
            value={String(summary.pendingWorkCount)}
            tone={summary.pendingWorkCount > 0 ? "warning" : "muted"}
          />
        </div>
      </AppSection>

      <InventoryFilterBar
        search={
          <InputGroup
            className={cn("min-w-56 flex-1", isCompactLayout ? "h-12" : "h-10")}
          >
            <InputGroupAddon>
              <IconSearch />
            </InputGroupAddon>
            <InputGroupInput
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={stockCopy.filters.searchPlaceholder}
              inputMode="search"
            />
          </InputGroup>
        }
        filters={
          <>
            <Select value={activeCategory} onValueChange={setActiveCategory}>
              <SelectTrigger className="min-w-40">
                <SelectValue
                  placeholder={stockCopy.filters.categoryPlaceholder}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {stockCopy.filters.allCategories}
                </SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={stockFilter}
              onValueChange={(v) => setStockFilter(v as StockFilter)}
            >
              <SelectTrigger className="min-w-36">
                <SelectValue
                  placeholder={stockCopy.filters.statusPlaceholder}
                />
              </SelectTrigger>
              <SelectContent>
                {stockFilterOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={riskFilter}
              onValueChange={(v) => setRiskFilter(v as RiskFilter)}
            >
              <SelectTrigger className="min-w-40">
                <SelectValue placeholder={stockCopy.filters.riskPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {riskFilterOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={sortMode}
              onValueChange={(v) => setSortMode(v as SortMode)}
            >
              <SelectTrigger className="min-w-56">
                <SelectValue placeholder={stockCopy.filters.sortPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
        actions={
          <>
            {canReceiveStock ? (
              <QuickActionButton
                href={actionHrefs.receive}
                icon={IconReceipt}
                label={receiveActionLabel}
                primary
              />
            ) : null}
            {actionPermissions.canCreateTransfer ? (
              <QuickActionButton
                href={actionHrefs.transfer}
                icon={IconTruck}
                label={stockCopy.actions.transfer}
              />
            ) : null}
            {actionPermissions.canCreateStocktake && actionHrefs.stocktake ? (
              <QuickActionButton
                href={actionHrefs.stocktake}
                icon={IconClipboardList}
                label={stockCopy.actions.stocktake}
              />
            ) : null}
            {actionPermissions.canWriteoff && summary.expiryCount > 0 ? (
              <QuickActionButton
                href={actionHrefs.expiry}
                icon={IconCalendarClock}
                label={stockCopy.actions.expiry}
              />
            ) : null}
            {actionPermissions.canWriteoff ? (
              <QuickActionButton
                href={actionHrefs.waste}
                icon={IconTrash}
                label={stockCopy.actions.waste}
              />
            ) : null}
            {actionPermissions.canCreatePurchaseOrder &&
            actionHrefs.purchaseSuggestion ? (
              <QuickActionButton
                href={actionHrefs.purchaseSuggestion}
                icon={IconShoppingCart}
                label={stockCopy.actions.purchaseSuggestion}
              />
            ) : null}
          </>
        }
        reset={
          !isFirstLoadEmpty ? (
            <Badge variant="outline" aria-live="polite">
              {filtered.length}/{ingredients.length}
            </Badge>
          ) : null
        }
      />

      {isFirstLoadEmpty ? (
        <AppEmptyState
          title={stockCopy.empty.firstLoadTitle}
          description={stockCopy.empty.firstLoadHint}
          icon={<IconShoppingCart />}
        >
          {actionPermissions.canCreatePurchaseOrder &&
          actionHrefs.purchaseSuggestion ? (
            <Button asChild size="sm">
              <Link href={actionHrefs.purchaseSuggestion}>
                <IconShoppingCart className="size-4" />
                {stockCopy.actions.purchaseSuggestion}
              </Link>
            </Button>
          ) : null}
        </AppEmptyState>
      ) : isCompactLayout ? (
        <div className="flex flex-col gap-2">
          {filtered.length === 0 ? (
            <AppEmptyState
              compact
              title={
                searchQuery.trim()
                  ? stockCopy.empty.search
                  : stockCopy.empty.noData
              }
              description={
                searchQuery.trim()
                  ? stockCopy.empty.searchDescription
                  : stockCopy.empty.noDataDescription
              }
            />
          ) : (
            filtered.map((item) => (
              <InteractiveCard
                key={item.id}
                minHeight="mobile"
                padding="default"
                className="flex-col items-stretch gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link
                      href={stockDetailHref(item.id)}
                      className="truncate font-semibold hover:underline"
                    >
                      {item.name}
                    </Link>
                    <div className="flex items-center gap-2">
                      {item.category ? (
                        <Badge
                          className={
                            CATEGORY_TONE_CLASS[item.category] ??
                            "bg-muted text-muted-foreground"
                          }
                        >
                          {item.category}
                        </Badge>
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        {item.sku}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <StatusBadge
                      domain="inventory"
                      value={item.status}
                      size="sm"
                    />
                    {item.qty <= item.reorder ? (
                      <Badge variant="warning">
                        {stockCopy.filters.reorder}
                      </Badge>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {stockCopy.table.availableStock}
                    </p>
                    <p
                      className={cn(
                        "font-semibold tabular-nums",
                        (item.status === "low" || item.status === "out") &&
                          "text-destructive",
                      )}
                    >
                      {formatQty(item.qty)} {item.unit}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      {FORM_VI.value}
                    </p>
                    <p className="font-semibold tabular-nums">
                      {stockValue(item) > 0
                        ? inventoryCommon.currencyCompact(
                            formatVND(stockValue(item)),
                          )
                        : inventoryCommon.noValue}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {stockCopy.table.wac}
                    </p>
                    <p className="tabular-nums">
                      {item.cost > 0
                        ? inventoryCommon.currencyCompact(formatVND(item.cost))
                        : inventoryCommon.noValue}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      {stockCopy.table.lastCount}
                    </p>
                    <p>{item.lastCount}</p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 border-t pt-2">
                  {canReceiveStock ? (
                    <Button asChild size="xs" variant="outline">
                      <Link href={actionHrefs.receive}>
                        {stockCopy.actions.receive}
                      </Link>
                    </Button>
                  ) : null}
                  {actionPermissions.canCreateIssue ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        setQuickIssueTarget({
                          ingredient: item,
                          issueType: "consumption",
                        })
                      }
                    >
                      {ACTIONS_VI.export}
                    </Button>
                  ) : null}
                  {actionPermissions.canCreateStocktake &&
                  actionHrefs.stocktake ? (
                    <Button asChild size="xs" variant="outline">
                      <Link href={actionHrefs.stocktake}>
                        {stockCopy.actions.count}
                      </Link>
                    </Button>
                  ) : null}
                  {actionPermissions.canAdjustException ? (
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => setAdjustTarget(item)}
                      aria-label={stockCopy.actions.adjustExceptionAria(
                        item.name,
                      )}
                    >
                      <IconPencil />
                    </Button>
                  ) : null}
                </div>
              </InteractiveCard>
            ))
          )}
        </div>
      ) : (
        <AppSection className="overflow-hidden" contentFlush>
          <div className="grid lg:grid-cols-3 xl:grid-cols-4">
            <div className="min-w-0 lg:col-span-2 xl:col-span-3">
              <DataTable
                columns={stockColumns}
                data={filtered}
                getRowKey={(item) => item.id}
                emptyTitle={
                  searchQuery.trim()
                    ? stockCopy.empty.search
                    : stockCopy.empty.noData
                }
                emptyDescription={
                  searchQuery.trim()
                    ? stockCopy.empty.searchDescription
                    : stockCopy.empty.noDataDescription
                }
                emptyMode={searchQuery.trim() ? "no-results" : "no-data"}
                onRowClick={(item) => {
                  if (embedded) {
                    router.push(stockDetailHref(item.id));
                    return;
                  }
                  setSelectedId(item.id);
                }}
                getRowAriaLabel={(item) =>
                  stockCopy.actions.viewDetailAria(item.name)
                }
                getRowDataState={(item) =>
                  selected?.id === item.id ? "selected" : undefined
                }
                mobileCardRender={(item) => (
                  <InteractiveCard minHeight="mobile" padding="default">
                    <span className="font-semibold">{item.name}</span>
                  </InteractiveCard>
                )}
              />
            </div>

            <aside className="border-t bg-background/70 p-3 lg:border-l lg:border-t-0">
              {selected ? (
                <div className="flex h-full flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="font-heading truncate text-base font-semibold">
                          {selected.name}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          {selected.sku}
                          {selected.category ? ` · ${selected.category}` : ""}
                        </p>
                      </div>
                      <StatusBadge
                        domain="inventory"
                        value={selected.status}
                        size="sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {stockCopy.table.currentStock}
                      </p>
                      <p className="font-semibold tabular-nums">
                        {formatQty(selected.qty)} {selected.unit}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {stockCopy.table.stockValue}
                      </p>
                      <p className="font-semibold tabular-nums">
                        {inventoryCommon.currencyCompact(
                          formatVND(stockValue(selected)),
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {stockCopy.table.wac}
                      </p>
                      <p className="tabular-nums">
                        {inventoryCommon.currencyCompact(
                          formatVND(selected.cost),
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {stockCopy.table.lastCount}
                      </p>
                      <p>{selected.lastCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {stockCopy.table.minThreshold}
                      </p>
                      <p className="tabular-nums">{formatQty(selected.min)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Reorder</p>
                      <p className="tabular-nums">
                        {formatQty(selected.reorder)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {canReceiveStock ? (
                      <Button asChild size="sm">
                        <Link href={actionHrefs.receive}>
                          <IconReceipt className="size-3.5" />
                          {stockCopy.actions.receiveGoods}
                        </Link>
                      </Button>
                    ) : null}
                    {actionPermissions.canCreateIssue ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setQuickIssueTarget({
                            ingredient: selected,
                            issueType: "consumption",
                          })
                        }
                      >
                        <IconTruck className="size-3.5" />
                        {stockCopy.actions.issueStock}
                      </Button>
                    ) : null}
                    {actionPermissions.canCreateStocktake &&
                    actionHrefs.stocktake ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={actionHrefs.stocktake}>
                          <IconClipboardList className="size-3.5" />
                          {stockCopy.actions.stocktake}
                        </Link>
                      </Button>
                    ) : null}
                    {actionPermissions.canWriteoff ? (
                      embedded ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href={actionHrefs.waste}>
                            <IconTrash className="size-3.5" />
                            {stockCopy.actions.waste}
                          </Link>
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setQuickIssueTarget({
                              ingredient: selected,
                              issueType: "writeoff",
                            })
                          }
                        >
                          <IconTrash className="size-3.5" />
                          {stockCopy.actions.waste}
                        </Button>
                      )
                    ) : null}
                    {actionHrefs.reports ? (
                      <Button asChild size="sm" variant="ghost">
                        <Link href={stockDetailHref(selected.id)}>
                          <IconArrowBarRight className="size-3.5" />
                          {stockCopy.actions.viewStockCard}
                        </Link>
                      </Button>
                    ) : null}
                    {actionPermissions.canAdjustException ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => setAdjustTarget(selected)}
                      >
                        <IconPencil className="size-3.5" />
                        {stockCopy.actions.exception}
                      </Button>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-2 border-t pt-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{stockCopy.table.history}</p>
                      <Badge variant="outline">
                        {selectedHistory.length}/5
                      </Badge>
                    </div>
                    {selectedHistory.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {stockCopy.table.noRecentHistory}
                      </p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {selectedHistory.map((movement) => {
                          const reference = movementReference(movement);
                          const signedQty =
                            movement.quantityChange > 0
                              ? `+${formatQty(movement.quantityChange)}`
                              : formatQty(movement.quantityChange);

                          return (
                            <div
                              key={movement.id}
                              className="flex flex-col gap-1 rounded-md border bg-background p-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-medium">
                                    {movementLabel(movement)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatDateTime(movement.createdAt)}
                                  </p>
                                </div>
                                <Badge
                                  variant={movementVariant(
                                    movement.quantityChange,
                                  )}
                                  className="shrink-0"
                                >
                                  {signedQty} {selected.unit}
                                </Badge>
                              </div>
                              {reference ||
                              movement.reason ||
                              movement.unitCost != null ? (
                                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                                  {reference ? <p>{reference}</p> : null}
                                  {movement.reason ? (
                                    <p className="break-words">
                                      {movement.reason}
                                    </p>
                                  ) : null}
                                  {movement.unitCost != null ? (
                                    <p>
                                      {stockCopy.table.wacValue(
                                        formatVND(movement.unitCost),
                                      )}
                                    </p>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
                  {stockCopy.table.chooseIngredientDetail}
                </div>
              )}
            </aside>
          </div>
        </AppSection>
      )}

      <AppSection
        size="sm"
        contentClassName="py-2 text-xs text-muted-foreground"
      >
        {stockCopy.table.filteredSummary(
          filtered.length,
          formatVND(filteredValue),
        )}
      </AppSection>

      {adjustTarget ? (
        <AdjustStockDialog
          open={adjustTarget !== null}
          onOpenChange={(open) => {
            if (!open) setAdjustTarget(null);
          }}
          branchId={branchId}
          ingredientId={adjustTarget.id}
          ingredientName={adjustTarget.name}
          unit={adjustTarget.unit}
          onAdjusted={() => {
            setAdjustTarget(null);
            router.refresh();
          }}
        />
      ) : null}

      {quickIssueTarget ? (
        <QuickStockIssueDialog
          key={`${quickIssueTarget.ingredient.id}-${quickIssueTarget.issueType}`}
          branchId={branchId}
          open={quickIssueTarget !== null}
          target={quickIssueTarget}
          issueBasePath={
            embedded
              ? branchStockHref(stockRootPath, "/issues")
              : "/inventory/issues"
          }
          onOpenChange={(open) => {
            if (!open) setQuickIssueTarget(null);
          }}
        />
      ) : null}
    </>
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{content}</div>;
  }

  return (
    <InventoryPageContent
      width={isCompactLayout ? "narrow" : "wide"}
      className={isCompactLayout ? undefined : "p-3"}
      contentClassName={isCompactLayout ? undefined : "max-w-none gap-3"}
      scroll
    >
      {content}
    </InventoryPageContent>
  );
}
