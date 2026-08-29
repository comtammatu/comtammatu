"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Sparkles as IconSparkles,
  Check as IconCheck,
  Building2 as IconBuilding,
  Truck as IconTruck,
  ChefHat as IconChefHat,
  AlertTriangle as IconAlert,
  Search as IconSearch,
} from "lucide-react";
import { formatQuantity } from "@comtammatu/shared/format";
import { ACTIONS_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { AppDialog } from "@/components/form";
import { useFormControlSize } from "@/components/form/control-size";
import { Frame } from "@comtammatu/ui/components/frame";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import type {
  ReorderSuggestionItem,
  SupplyChannel,
} from "@lib/inventory/smart-reorder-data";
import { createReorderDraftDemandsAction } from "@/(protected)/inventory/stock-actions";

type ReorderStatusFilter = "all" | "below" | "safe";
type SupplyChannelFilter = "all" | SupplyChannel;
type ReorderItemWithUnit = ReorderSuggestionItem & { baseUnitId: number };

function getUnitLabel(item: ReorderSuggestionItem): string | null {
  return item.baseUnitCode?.trim() || item.baseUnitName?.trim() || null;
}

function hasEntryUnit(
  item: ReorderSuggestionItem,
): item is ReorderItemWithUnit {
  return item.baseUnitId != null;
}

function hasConfiguredUnit(
  item: ReorderSuggestionItem,
): item is ReorderItemWithUnit {
  return hasEntryUnit(item) && getUnitLabel(item) != null;
}

export function SmartReorderSheet({
  branchId,
  branchName,
  items,
  trigger,
}: {
  branchId: number;
  branchName?: string | null;
  items: ReorderSuggestionItem[];
  trigger?: React.ReactNode;
}) {
  const controlSize = useFormControlSize();
  const menuItemSize = controlSize === "touch" ? "touch" : "default";
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [reorderStatusFilter, setReorderStatusFilter] =
    useState<ReorderStatusFilter>("below");
  const [supplyChannelFilter, setSupplyChannelFilter] =
    useState<SupplyChannelFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    new Set(
      items
        .filter((item) => item.isBelowMin && hasConfiguredUnit(item))
        .map((item) => item.ingredientId),
    ),
  );
  const [quantities, setQuantities] = useState<Map<number, number>>(
    new Map(items.map((i) => [i.ingredientId, i.suggestedReorderQty || 1])),
  );
  const [isPending, startTransition] = useTransition();
  const [successResult, setSuccessResult] = useState<{
    poCount: number;
    trCount: number;
  } | null>(null);

  const filteredItems = useMemo(() => {
    const query = search.toLocaleLowerCase("vi").trim();
    return items.filter((item) => {
      const matchesQuery =
        query === "" ||
        item.ingredientName.toLocaleLowerCase("vi").includes(query) ||
        item.sku?.toLocaleLowerCase("vi").includes(query) ||
        item.categoryName?.toLocaleLowerCase("vi").includes(query);
      const matchesStatus =
        reorderStatusFilter === "all" ||
        (reorderStatusFilter === "below" && item.isBelowMin) ||
        (reorderStatusFilter === "safe" && !item.isBelowMin);
      const matchesChannel =
        supplyChannelFilter === "all" ||
        item.supplyChannel === supplyChannelFilter;

      return matchesQuery && matchesStatus && matchesChannel;
    });
  }, [items, reorderStatusFilter, search, supplyChannelFilter]);

  const visibleSelectableIds = filteredItems
    .filter(hasConfiguredUnit)
    .map((item) => item.ingredientId);
  const allVisibleSelected =
    visibleSelectableIds.length > 0 &&
    visibleSelectableIds.every((id) => selectedIds.has(id));
  const hasActiveFilters =
    search.trim() !== "" ||
    reorderStatusFilter !== "below" ||
    supplyChannelFilter !== "all";

  const toggleSelect = (id: number) => {
    const item = items.find((candidate) => candidate.ingredientId === id);
    if (!item || !hasConfiguredUnit(item)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const id of visibleSelectableIds) next.delete(id);
      } else {
        for (const id of visibleSelectableIds) next.add(id);
      }
      return next;
    });
  };

  const handleQtyChange = (id: number, val: string) => {
    const num = Math.max(1, Number(val) || 1);
    setQuantities((prev) => new Map(prev).set(id, num));
  };

  const handleCreateDrafts = () => {
    const selectedItems = items.filter(
      (item): item is ReorderItemWithUnit =>
        selectedIds.has(item.ingredientId) && hasConfiguredUnit(item),
    );
    if (selectedItems.length === 0) return;

    startTransition(async () => {
      const res = await createReorderDraftDemandsAction({
        branchId,
        items: selectedItems.map((item) => ({
          ingredientId: item.ingredientId,
          quantity: Math.max(
            1,
            quantities.get(item.ingredientId) ?? item.suggestedReorderQty,
          ),
          entryUnitId: item.baseUnitId,
          supplyChannel: item.supplyChannel,
        })),
      });

      if (res.success && res.data) {
        setSuccessResult({
          poCount: res.data.createdPurchaseDemandCount,
          trCount: res.data.createdStockRequestCount,
        });
        setTimeout(() => {
          setSuccessResult(null);
          setOpen(false);
        }, 1500);
      } else {
        toast.error(INVENTORY_VI.smartReorderCreateFailed);
      }
    });
  };

  const getChannelBadge = (channel: SupplyChannel) => {
    switch (channel) {
      case "internal_transfer_kitchen":
        return (
          <Badge variant="info" className="gap-1">
            <IconChefHat className="size-3" />
            <span>{INVENTORY_VI.smartReorderChannelKitchen}</span>
          </Badge>
        );
      case "internal_transfer_supply":
        return (
          <Badge variant="secondary" className="gap-1">
            <IconBuilding className="size-3" />
            <span>{INVENTORY_VI.smartReorderChannelSupply}</span>
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1">
            <IconTruck className="size-3" />
            <span>{INVENTORY_VI.smartReorderChannelSupplier}</span>
          </Badge>
        );
    }
  };

  return (
    <>
      {trigger !== undefined ? (
        <span
          onClick={() => setOpen(true)}
          role="presentation"
          className="inline-flex cursor-pointer"
        >
          {trigger}
        </span>
      ) : (
        <Button
          variant="default"
          size="sm"
          className="gap-1.5"
          onClick={() => setOpen(true)}
        >
          <IconSparkles className="size-4" />
          <span>{INVENTORY_VI.smartReorderOpenBtn}</span>
          {items.filter((i) => i.isBelowMin).length > 0 && (
            <Badge variant="destructive" className="ml-1 px-1.5 h-4 text-2xs">
              {items.filter((i) => i.isBelowMin).length}
            </Badge>
          )}
        </Button>
      )}

      <AppDialog
        open={open}
        onOpenChange={setOpen}
        title={
          <div className="flex items-center gap-2">
            <IconSparkles className="size-5 text-primary" />
            <span>{INVENTORY_VI.smartReorderTitle}</span>
          </div>
        }
        description={`${branchName ? `${branchName} — ` : ""}${INVENTORY_VI.smartReorderDescription}`}
        contentClassName="max-w-3xl"
        footer={
          <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-muted-foreground">
              {INVENTORY_VI.smartReorderSelectedCount(
                selectedIds.size,
                items.filter(hasConfiguredUnit).length,
              )}
            </span>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <Button
                variant="outline"
                size={controlSize}
                onClick={() => setOpen(false)}
              >
                {ACTIONS_VI.cancel}
              </Button>
              <Button
                size={controlSize}
                onClick={handleCreateDrafts}
                disabled={
                  selectedIds.size === 0 || isPending || successResult !== null
                }
              >
                {successResult ? (
                  <>
                    <IconCheck className="size-4 mr-1 text-success" />
                    <span>{INVENTORY_VI.smartReorderCreatedSuccess}</span>
                  </>
                ) : isPending ? (
                  INVENTORY_VI.submittingEllipsis
                ) : (
                  INVENTORY_VI.smartReorderCreateDraftsBtn(selectedIds.size)
                )}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex max-h-dvh-70 flex-col gap-4 overflow-y-auto">
          <div className="flex flex-col gap-2">
            <InputGroup size={controlSize}>
              <InputGroupAddon>
                <IconSearch className="size-4 text-muted-foreground" />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                inputMode="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={INVENTORY_VI.smartReorderSearchPlaceholder}
              />
            </InputGroup>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select
                value={reorderStatusFilter}
                onValueChange={(value) =>
                  setReorderStatusFilter(value as ReorderStatusFilter)
                }
              >
                <SelectTrigger
                  size={controlSize}
                  className="w-full min-w-0 sm:flex-1"
                  aria-label={INVENTORY_VI.smartReorderStatusAll}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" size={menuItemSize}>
                    {INVENTORY_VI.smartReorderStatusAll}
                  </SelectItem>
                  <SelectItem value="below" size={menuItemSize}>
                    {INVENTORY_VI.smartReorderStatusBelow}
                  </SelectItem>
                  <SelectItem value="safe" size={menuItemSize}>
                    {INVENTORY_VI.smartReorderStatusSafe}
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={supplyChannelFilter}
                onValueChange={(value) =>
                  setSupplyChannelFilter(value as SupplyChannelFilter)
                }
              >
                <SelectTrigger
                  size={controlSize}
                  className="w-full min-w-0 sm:flex-1"
                  aria-label={INVENTORY_VI.smartReorderChannelAll}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" size={menuItemSize}>
                    {INVENTORY_VI.smartReorderChannelAll}
                  </SelectItem>
                  <SelectItem value="supplier_po" size={menuItemSize}>
                    {INVENTORY_VI.smartReorderChannelSupplier}
                  </SelectItem>
                  <SelectItem
                    value="internal_transfer_kitchen"
                    size={menuItemSize}
                  >
                    {INVENTORY_VI.smartReorderChannelKitchen}
                  </SelectItem>
                  <SelectItem
                    value="internal_transfer_supply"
                    size={menuItemSize}
                  >
                    {INVENTORY_VI.smartReorderChannelSupply}
                  </SelectItem>
                </SelectContent>
              </Select>

              {hasActiveFilters ? (
                <Button
                  type="button"
                  variant="ghost"
                  size={controlSize}
                  onClick={() => {
                    setSearch("");
                    setReorderStatusFilter("below");
                    setSupplyChannelFilter("all");
                  }}
                >
                  {ACTIONS_VI.clearFilters}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size={controlSize}
              onClick={handleSelectAll}
              disabled={visibleSelectableIds.length === 0}
              className="sm:w-auto"
            >
              {allVisibleSelected
                ? ACTIONS_VI.deselectAll
                : INVENTORY_VI.smartReorderSelectResults}
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">
              {INVENTORY_VI.branchThresholdsFilterResult(
                filteredItems.length,
                items.length,
              )}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {filteredItems.map((item) => {
              const isSelected = selectedIds.has(item.ingredientId);
              const qty =
                quantities.get(item.ingredientId) ??
                item.suggestedReorderQty ??
                1;
              const unitLabel = getUnitLabel(item);
              const canCreateDemand = hasConfiguredUnit(item);

              return (
                <Frame
                  key={item.ingredientId}
                  className={`flex min-w-0 flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between ${
                    isSelected ? "border-primary bg-muted" : ""
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <Checkbox
                      size={controlSize === "touch" ? "touch" : "default"}
                      checked={isSelected}
                      disabled={!canCreateDemand}
                      onCheckedChange={() => toggleSelect(item.ingredientId)}
                      aria-label={`${INVENTORY_VI.smartReorderSelectResults}: ${item.ingredientName}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="min-w-0 truncate text-sm font-semibold">
                          {item.ingredientName}
                        </span>
                        {item.isBelowMin && (
                          <Badge
                            variant="destructive"
                            className="gap-1 text-2xs"
                          >
                            <IconAlert className="size-3" />
                            <span>{INVENTORY_VI.underThresholdBadge}</span>
                          </Badge>
                        )}
                        {getChannelBadge(item.supplyChannel)}
                        {!canCreateDemand ? (
                          <Badge variant="outline">
                            {INVENTORY_VI.missingInventoryUnit}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          {item.categoryName ?? INVENTORY_VI.uncategorized}
                        </span>
                        <span>{item.sku ?? "—"}</span>
                        <span>
                          {INVENTORY_VI.currentOnHandLabel}{" "}
                          <strong className="text-foreground font-semibold">
                            {formatQuantity(item.currentOnHand)}
                            {unitLabel ? ` ${unitLabel}` : ""}
                          </strong>
                        </span>
                        <span>
                          {INVENTORY_VI.minStockLabel}{" "}
                          <strong className="text-foreground font-semibold">
                            {formatQuantity(item.minStockLevel)}
                            {unitLabel ? ` ${unitLabel}` : ""}
                          </strong>
                        </span>
                      </div>
                      {!canCreateDemand ? (
                        <p className="mt-1 text-xs text-warning-foreground">
                          {INVENTORY_VI.smartReorderMissingUnitHint}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 sm:w-56">
                    <label
                      htmlFor={`reorder-quantity-${item.ingredientId}`}
                      className="text-xs text-muted-foreground"
                    >
                      {INVENTORY_VI.suggestedQtyLabel}
                    </label>
                    <InputGroup size={controlSize} className="flex-1">
                      <InputGroupInput
                        id={`reorder-quantity-${item.ingredientId}`}
                        type="number"
                        min={1}
                        value={qty}
                        disabled={!canCreateDemand}
                        onChange={(event) =>
                          handleQtyChange(item.ingredientId, event.target.value)
                        }
                        className="min-w-0 text-right text-sm font-semibold tabular-nums"
                      />
                      <InputGroupAddon
                        align="inline-end"
                        className="max-w-16 truncate"
                      >
                        {unitLabel ?? INVENTORY_VI.missingInventoryUnit}
                      </InputGroupAddon>
                    </InputGroup>
                  </div>
                </Frame>
              );
            })}

            {filteredItems.length === 0 && (
              <div className="p-3 text-center text-sm text-muted-foreground">
                {items.length === 0
                  ? INVENTORY_VI.smartReorderAllSafe
                  : INVENTORY_VI.smartReorderNoResults}
              </div>
            )}
          </div>
        </div>
      </AppDialog>
    </>
  );
}
