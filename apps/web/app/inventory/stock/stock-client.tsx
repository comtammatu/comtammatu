"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatVNDate } from "@comtammatu/shared/time";
import {
  ArrowRightToLine as IconArrowBarRight,
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
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
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { cn } from "@comtammatu/ui";
import { messages } from "@lib/messages";
import { matchesSearch } from "@lib/search";
import { AppPageHeader } from "@/components/surface";
import {
  InventoryFilterBar,
  InventoryPageContent,
} from "../_components/inventory-page-layout";
import { StatusBadge } from "../_components/status-badge";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { InteractiveCard } from "../_components/interactive-card";
import { FormattedNumberInput } from "../_components/formatted-number-input";
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

const STATUS_PRIORITY: Record<StockIngredient["status"], number> = {
  out: 0,
  low: 1,
  over: 2,
  normal: 3,
};

function branchHref(branchId: number, path: string): string {
  return `${path}?branchId=${branchId}`;
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
  onOpenChange,
}: {
  branchId: number;
  open: boolean;
  target: QuickIssueTarget;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [issueType, setIssueType] = useState<QuickIssueType>(target.issueType);
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState(target.ingredient.unit);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const activeIssueType = quickIssueTypeOptions.find(
    (option) => option.value === issueType,
  );
  const title =
    issueType === "writeoff"
      ? stockCopy.quickIssue.writeoffTitle
      : stockCopy.quickIssue.issueTitle;

  function resetForm() {
    setIssueType(target.issueType);
    setQuantity("");
    setUnit(target.ingredient.unit);
    setReason("");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      toast.error(stockCopy.quickIssue.quantityPositive);
      return;
    }
    if (parsedQuantity > target.ingredient.qty) {
      toast.error(stockCopy.quickIssue.quantityExceedsStock);
      return;
    }
    if (!unit.trim()) {
      toast.error(stockCopy.quickIssue.unitRequired);
      return;
    }
    if (!reason.trim()) {
      toast.error(stockCopy.quickIssue.reasonRequired);
      return;
    }

    startTransition(async () => {
      const draftRes = await createStockIssueDraft({
        branchId,
        issueType,
        notes: stockCopy.quickIssue.draftNotes(target.ingredient.name),
      });
      if (!draftRes.success || !draftRes.data) {
        toast.error(draftRes.error ?? stockCopy.quickIssue.createDraftFailed);
        return;
      }

      const issueId = Number((draftRes.data as { id: number }).id);
      const lineRes = await upsertStockIssueLine({
        issueId,
        ingredientId: target.ingredient.id,
        quantity: parsedQuantity,
        unit: unit.trim(),
        reason: reason.trim(),
      });
      if (!lineRes.success) {
        toast.error(lineRes.error ?? stockCopy.quickIssue.addLineFailed);
        router.push(`/inventory/issues/${issueId}`);
        return;
      }

      toast.success(stockCopy.quickIssue.created(target.ingredient.name));
      onOpenChange(false);
      resetForm();
      router.push(`/inventory/issues/${issueId}`);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) resetForm();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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

          <div className="flex flex-col gap-1.5">
            <Label>{stockCopy.quickIssue.operation}</Label>
            <Select
              value={issueType}
              onValueChange={(value) => setIssueType(value as QuickIssueType)}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {quickIssueTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quick-issue-qty">{FORM_VI.quantity}</Label>
              <FormattedNumberInput
                id="quick-issue-qty"
                value={quantity}
                onValueChange={setQuantity}
                maxFractionDigits={3}
                placeholder="0"
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quick-issue-unit">{FORM_VI.unit}</Label>
              <Input
                id="quick-issue-unit"
                value={unit}
                readOnly
                aria-readonly="true"
                disabled={isPending}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quick-issue-reason">{FORM_VI.reason}</Label>
            <Textarea
              id="quick-issue-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              placeholder={activeIssueType?.reasonPlaceholder}
              disabled={isPending}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? stockCopy.quickIssue.creating
                : stockCopy.quickIssue.createSlip}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
}: {
  ingredients: StockIngredient[];
  branchId: number;
  branchValue: number | null;
  totalValue: number | null;
  summary: StockWorkSummary;
  permissions: StockActionPermissions;
  movementHistory: StockMovementHistory[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
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

  return (
    <InventoryPageContent
      width={isMobile ? "narrow" : "wide"}
      className={isMobile ? undefined : "p-3"}
      contentClassName={isMobile ? undefined : "max-w-none gap-2"}
      scroll
    >
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
      <div className="flex flex-wrap items-center gap-2 border bg-card p-2">
        {permissions.canReceiveGrn ? (
          <QuickActionButton
            href={branchHref(branchId, "/inventory/grn")}
            icon={IconReceipt}
            label={stockCopy.actions.receiveGrn}
            primary
          />
        ) : null}
        {permissions.canCreateTransfer ? (
          <QuickActionButton
            href={branchHref(branchId, "/inventory/transfers")}
            icon={IconTruck}
            label={stockCopy.actions.transfer}
          />
        ) : null}
        {permissions.canCreateStocktake ? (
          <QuickActionButton
            href={branchHref(branchId, "/inventory/stocktake")}
            icon={IconClipboardList}
            label={stockCopy.actions.stocktake}
          />
        ) : null}
        {permissions.canWriteoff ? (
          <QuickActionButton
            href={branchHref(branchId, "/inventory/waste/new")}
            icon={IconTrash}
            label={stockCopy.actions.waste}
          />
        ) : null}
        {permissions.canCreatePurchaseOrder ? (
          <QuickActionButton
            href={branchHref(branchId, "/inventory/purchase-orders/new")}
            icon={IconShoppingCart}
            label={stockCopy.actions.purchaseSuggestion}
          />
        ) : null}

        <InputGroup
          className={cn("min-w-56 flex-1", isMobile ? "h-12" : "h-10")}
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
          {searchQuery.trim() ? (
            <InputGroupAddon align="inline-end">
              <span
                className="font-mono text-xs tabular-nums text-muted-foreground"
                aria-live="polite"
              >
                {filtered.length}/{ingredients.length}
              </span>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
      </div>

      <div className="flex flex-wrap items-center divide-x overflow-hidden border bg-card">
        <SummaryMetric
          label={stockCopy.metrics.selectedWarehouse}
          value={inventoryCommon.currencyCompact(formatVND(visibleTotalValue))}
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

      <InventoryFilterBar className="gap-2 p-2">
        <Select value={activeCategory} onValueChange={setActiveCategory}>
          <SelectTrigger className="min-w-40">
            <SelectValue placeholder={stockCopy.filters.categoryPlaceholder} />
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
            <SelectValue placeholder={stockCopy.filters.statusPlaceholder} />
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

        {!isFirstLoadEmpty ? (
          <Badge variant="outline" className="ml-auto">
            {filtered.length}/{ingredients.length}
          </Badge>
        ) : null}
      </InventoryFilterBar>

      {isFirstLoadEmpty ? (
        <Card className="bg-muted/20">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <IconShoppingCart className="size-6" />
            </div>
            <div className="space-y-1">
              <p className="font-heading text-base font-semibold">
                {stockCopy.empty.firstLoadTitle}
              </p>
              <p className="max-w-md text-sm text-muted-foreground">
                {stockCopy.empty.firstLoadHint}
              </p>
            </div>
            {permissions.canCreatePurchaseOrder ? (
              <Button asChild size="sm">
                <Link
                  href={branchHref(branchId, "/inventory/purchase-orders/new")}
                >
                  <IconShoppingCart className="size-4" />
                  {stockCopy.actions.purchaseSuggestion}
                </Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : isMobile ? (
        <div className="flex flex-col gap-2">
          {filtered.length === 0 ? (
            <Empty className="py-8">
              <EmptyHeader>
                <EmptyTitle className="text-sm font-semibold">
                  {searchQuery.trim()
                    ? stockCopy.empty.search
                    : stockCopy.empty.noData}
                </EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            filtered.map((item) => (
              <InteractiveCard
                key={item.id}
                minHeight="mobile"
                padding="default"
                className="flex-col items-stretch gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate font-semibold">{item.name}</p>
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
                  <StatusBadge status={item.status} size="sm" />
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
                      {inventoryCommon.currencyCompact(
                        formatVND(stockValue(item)),
                      )}
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
                  {permissions.canReceiveGrn ? (
                    <Button asChild size="xs" variant="outline">
                      <Link href={branchHref(branchId, "/inventory/grn")}>
                        {stockCopy.actions.receive}
                      </Link>
                    </Button>
                  ) : null}
                  {permissions.canCreateIssue ? (
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
                  {permissions.canCreateStocktake ? (
                    <Button asChild size="xs" variant="outline">
                      <Link href={branchHref(branchId, "/inventory/stocktake")}>
                        {stockCopy.actions.count}
                      </Link>
                    </Button>
                  ) : null}
                  {permissions.canAdjustException ? (
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
        <div className="grid overflow-hidden border bg-card lg:grid-cols-3 xl:grid-cols-4">
          <div className="min-w-0 lg:col-span-2 xl:col-span-3">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableHead className="min-w-56">
                      {PRODUCT_VI.rawIngredient}
                    </TableHead>
                    <TableHead className="min-w-32">
                      {FORM_VI.category}
                    </TableHead>
                    <TableHead className="min-w-24 text-right">
                      {stockCopy.table.stock}
                    </TableHead>
                    <TableHead className="min-w-40 text-right">
                      {stockCopy.table.warning}
                    </TableHead>
                    <TableHead className="min-w-24 text-right">
                      {stockCopy.table.wac}
                    </TableHead>
                    <TableHead className="min-w-28 text-right">
                      {FORM_VI.value}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableEmptyStateRow
                      colSpan={6}
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
                  ) : null}

                  {filtered.map((item) => {
                    const active = selected?.id === item.id;
                    return (
                      <TableRow
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        data-state={active ? "selected" : undefined}
                        className={cn(
                          "cursor-pointer hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        )}
                        onClick={() => setSelectedId(item.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedId(item.id);
                          }
                        }}
                        aria-label={stockCopy.actions.viewDetailAria(item.name)}
                      >
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-semibold">{item.name}</p>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-mono">{item.sku}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.category ? (
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
                          )}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-mono",
                            (item.status === "low" || item.status === "out") &&
                              "font-semibold text-destructive",
                          )}
                        >
                          {formatQty(item.qty)} {item.unit}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <StatusBadge status={item.status} size="sm" />
                            {item.qty <= item.reorder ? (
                              <Badge variant="warning">
                                {stockCopy.filters.reorder}
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {item.cost > 0
                            ? formatVND(item.cost)
                            : inventoryCommon.noValue}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {stockValue(item) > 0
                            ? inventoryCommon.currencyCompact(
                                formatVND(stockValue(item)),
                              )
                            : inventoryCommon.noValue}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <aside className="border-t bg-background/70 p-3 lg:border-l lg:border-t-0">
            {selected ? (
              <div className="flex h-full flex-col gap-4">
                <div className="space-y-2">
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
                    <StatusBadge status={selected.status} size="sm" />
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
                  {permissions.canReceiveGrn ? (
                    <Button asChild size="sm">
                      <Link href={branchHref(branchId, "/inventory/grn")}>
                        <IconReceipt className="size-3.5" />
                        {stockCopy.actions.receiveGoods}
                      </Link>
                    </Button>
                  ) : null}
                  {permissions.canCreateIssue ? (
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
                  {permissions.canCreateStocktake ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={branchHref(branchId, "/inventory/stocktake")}>
                        <IconClipboardList className="size-3.5" />
                        {stockCopy.actions.stocktake}
                      </Link>
                    </Button>
                  ) : null}
                  {permissions.canWriteoff ? (
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
                  ) : null}
                  <Button asChild size="sm" variant="ghost">
                    <Link href={branchHref(branchId, "/inventory/reports")}>
                      <IconArrowBarRight className="size-3.5" />
                      {stockCopy.actions.viewStockCard}
                    </Link>
                  </Button>
                  {permissions.canAdjustException ? (
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

                <div className="space-y-2 border-t pt-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{stockCopy.table.history}</p>
                    <Badge variant="outline">{selectedHistory.length}/5</Badge>
                  </div>
                  {selectedHistory.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {stockCopy.table.noRecentHistory}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {selectedHistory.map((movement) => {
                        const reference = movementReference(movement);
                        const signedQty =
                          movement.quantityChange > 0
                            ? `+${formatQty(movement.quantityChange)}`
                            : formatQty(movement.quantityChange);

                        return (
                          <div
                            key={movement.id}
                            className="space-y-1 border bg-card px-2 py-2"
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
                              <div className="space-y-0.5 text-xs text-muted-foreground">
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
              <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
                {stockCopy.table.chooseIngredientDetail}
              </div>
            )}
          </aside>
        </div>
      )}

      <div className="border bg-card px-3 py-2 text-xs text-muted-foreground">
        {stockCopy.table.filteredSummary(
          filtered.length,
          formatVND(filteredValue),
        )}
      </div>

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
          onOpenChange={(open) => {
            if (!open) setQuickIssueTarget(null);
          }}
        />
      ) : null}
    </InventoryPageContent>
  );
}
