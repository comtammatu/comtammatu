"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight as IconChevronRight,
  ClipboardList as IconClipboardList,
  LayoutGrid as IconMoreJobs,
  ListFilter as IconFilter,
  Package as IconPackage,
  RotateCcw as IconReset,
  Search as IconSearch,
  ShoppingCart as IconPurchase,
  Trash as IconTrash,
  Truck as IconTruck,
  X as IconX,
  ArrowLeft as IconArrowLeft,
} from "lucide-react";
import type { BranchKind } from "@comtammatu/shared/auth";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import {
  AppEmptyState,
  AppSheet,
} from "@/components/surface";
import { MultiSelectCombobox } from "@/components/form/multi-select-combobox";
import { formatQty } from "@lib/inventory/format";
import { formatStockUnits } from "@/(protected)/inventory/_lib/stock-unit-format";
import { ITEM_KIND_LABELS } from "@/(protected)/inventory/_lib/constants";
import {
  BranchOperatorControlBar,
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  STOCK_NO_CATEGORY_VALUE,
  STOCK_ON_HAND_DEFAULT_STATUS,
  filterStockOnHandIngredients,
  getStockOnHandCategories,
  hasStockOnHandFilters,
  isPristineStockOnHand,
  isStockReorderRisk,
  normalizeStockOnHandCategories,
  type StockActionPermissions,
  type StockFilter,
  type StockIngredient,
} from "@lib/inventory/stock-on-hand-model";
import { messages } from "@lib/messages";
import { PURCHASE_ORDER_CREATE_HREF } from "@lib/inventory/purchase-order-paths";

const stockCopy = messages.inventory.stock;

export type StockSecondaryJob = {
  key: string;
  href: string;
  title: string;
};

type AttentionCta = {
  key: string;
  href: string;
  label: string;
  icon: typeof IconTruck;
};

function StockQuantity({ item }: { item: StockIngredient }) {
  const { big, base } = formatStockUnits(item.qty, item.units, formatQty);
  const atRisk = isStockReorderRisk(item);
  const primaryClass = cn(
    "font-mono text-base font-semibold leading-5 tabular-nums",
    atRisk ? "text-destructive" : "text-foreground",
  );

  return (
    <div className="min-w-0 text-right">
      {big === null ? (
        <p className={primaryClass}>{base}</p>
      ) : (
        <div className="flex flex-col items-end leading-tight">
          <p className={primaryClass}>{big}</p>
          <p className="font-mono text-xs font-normal tabular-nums text-muted-foreground">
            {base}
          </p>
        </div>
      )}
    </div>
  );
}

function StockTouchRow({
  branchId,
  item,
}: {
  branchId: number;
  item: StockIngredient;
}) {
  return (
    <Item
      variant="default"
      size="sm"
      className="min-h-12 min-w-0 flex-nowrap touch-manipulation gap-2 rounded-none border-x-0 border-t-0 border-b border-border px-2 py-1.5 last:border-b-0"
      render={
        <Link
          href={`/br/${branchId}/stock/on-hand/${item.id}`}
          prefetch={true}
          aria-label={stockCopy.actions.viewDetailAria(item.name)}
          role="listitem"
        />
      }
    >
      <ItemContent className="min-w-0">
        <ItemTitle size="heading" className="min-w-0 w-auto max-w-full">
          {item.name}
        </ItemTitle>
        <ItemDescription>
          {[ITEM_KIND_LABELS[item.itemKind] ?? UNKNOWN_LABEL_VI, item.sku]
            .filter(Boolean)
            .join(" · ")}
        </ItemDescription>
      </ItemContent>

      <ItemActions className="shrink-0 justify-end">
        <StockQuantity item={item} />
        <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </ItemActions>
    </Item>
  );
}

function attentionTitle(branchKind: BranchKind): string {
  if (branchKind === "central_supply") {
    return stockCopy.attention.titleCentralSupply;
  }
  if (branchKind === "central_kitchen") {
    return stockCopy.attention.titleCentralKitchen;
  }
  return stockCopy.attention.title;
}

function resolveAttentionCtas({
  branchId,
  branchKind,
  permissions,
}: {
  branchId: number;
  branchKind: BranchKind;
  permissions: StockActionPermissions;
}): AttentionCta[] {
  const base = `/br/${branchId}/stock`;
  if (branchKind === "central_supply") {
    const ctas: AttentionCta[] = [];
    if (permissions.canReceiveGrn) {
      ctas.push({
        key: "grn",
        href: `${base}/grn`,
        label: stockCopy.actions.openGrn,
        icon: IconTruck,
      });
    }
    if (permissions.canManagePurchaseRequest) {
      ctas.push({
        key: "po",
        href: PURCHASE_ORDER_CREATE_HREF,
        label: messages.inventory.po.createAction,
        icon: IconPurchase,
      });
    }
    return ctas;
  }
  if (branchKind === "central_kitchen") {
    if (!permissions.canCreateTransfer) return [];
    return [
      {
        key: "request-cs",
        href: `${base}/transfer/new?direction=pull`,
        label: stockCopy.actions.requestFromCentralSupply,
        icon: IconTruck,
      },
    ];
  }
  if (!permissions.canCreateTransfer) return [];
  return [
    {
      key: "request",
      href: `${base}/transfer/new?direction=pull`,
      label: stockCopy.actions.requestStock,
      icon: IconTruck,
    },
  ];
}

function secondaryJobIcon(key: string) {
  if (key.includes("waste") || key.includes("issue")) return IconTrash;
  if (key.includes("stocktake") || key.includes("count")) {
    return IconClipboardList;
  }
  if (key.includes("purchase") || key.includes("grn")) return IconPurchase;
  if (key.includes("request") || key.includes("receive") || key.includes("transfer")) {
    return IconTruck;
  }
  return IconPackage;
}

function categoryLabel(value: string): string {
  if (value === STOCK_NO_CATEGORY_VALUE) return stockCopy.filters.noCategory;
  return value;
}

interface BranchStockOnHandClientProps {
  branchId: number;
  branchKind: BranchKind;
  permissions: StockActionPermissions;
  coreDataLoadFailed: boolean;
  ingredients: StockIngredient[];
  underThresholdCount: number;
  secondaryJobs: StockSecondaryJob[];
}

export function BranchStockOnHandClient({
  branchId,
  branchKind,
  permissions,
  coreDataLoadFailed,
  ingredients,
  underThresholdCount,
  secondaryJobs,
}: BranchStockOnHandClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [status, setStatus] = useState<StockFilter>(STOCK_ON_HAND_DEFAULT_STATUS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreJobsOpen, setMoreJobsOpen] = useState(false);
  const [draftCategories, setDraftCategories] = useState<string[]>([]);

  const { categories: categoryOptions, hasUncategorized } = useMemo(
    () => getStockOnHandCategories(ingredients),
    [ingredients],
  );
  const filters = { categories, query, status };
  const filtered = useMemo(
    () => filterStockOnHandIngredients(ingredients, filters),
    [ingredients, categories, query, status],
  );
  const filtersActive = hasStockOnHandFilters(filters);
  const facetCount =
    (status !== STOCK_ON_HAND_DEFAULT_STATUS ? 1 : 0) +
    normalizeStockOnHandCategories(categories).length;
  const isFirstLoadEmpty = !filtersActive && isPristineStockOnHand(ingredients);
  const attentionCtas = resolveAttentionCtas({
    branchId,
    branchKind,
    permissions,
  });

  const multiSelectOptions = useMemo(() => {
    const selected = new Set(normalizeStockOnHandCategories(draftCategories));
    const options = categoryOptions.map((item) => ({
      value: item,
      label: item,
      alreadySelected: selected.has(item),
    }));
    if (hasUncategorized) {
      options.push({
        value: STOCK_NO_CATEGORY_VALUE,
        label: stockCopy.filters.noCategory,
        alreadySelected: selected.has(STOCK_NO_CATEGORY_VALUE),
      });
    }
    return options;
  }, [categoryOptions, draftCategories, hasUncategorized]);

  function openFilterSheet() {
    setDraftCategories(categories);
    setFilterOpen(true);
  }

  function applyFilters() {
    setCategories(normalizeStockOnHandCategories(draftCategories));
    setFilterOpen(false);
  }

  function resetFilters() {
    setQuery("");
    setCategories([]);
    setStatus(STOCK_ON_HAND_DEFAULT_STATUS);
    setDraftCategories([]);
    setFilterOpen(false);
  }

  function removeCategory(value: string) {
    setDraftCategories((current) =>
      current.filter((item) => item !== value),
    );
  }

  const primaryAttentionCta = attentionCtas[0] ?? null;

  return (
    <BranchOperatorPage
      title={stockCopy.title}
      description={stockCopy.operatorDescription}
      hideHeaderOnMobile
    >
      <BranchOperatorControlBar className="sm:hidden">
        <Button
          variant="ghost"
          size="icon-touch"
          render={
            <Link href={`/br/${branchId}/stock`} aria-label={ACTIONS_VI.back} />
          }
        >
          <IconArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{stockCopy.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {stockCopy.operatorDescription}
          </p>
        </div>
      </BranchOperatorControlBar>
      {!coreDataLoadFailed && underThresholdCount > 0 ? (
        <NoteCallout tone="warning" className="min-h-12 items-center">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {attentionTitle(branchKind)}
              </p>
              <p className="truncate text-xs font-normal text-muted-foreground">
                {stockCopy.attention.description(underThresholdCount)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="warning">{underThresholdCount}</Badge>
              {primaryAttentionCta ? (
                <Button
                  size="touch"
                  className="shrink-0"
                  render={<Link href={primaryAttentionCta.href} />}
                >
                  {(() => {
                    const Icon = primaryAttentionCta.icon;
                    return <Icon />;
                  })()}
                  {primaryAttentionCta.label}
                </Button>
              ) : null}
            </div>
          </div>
        </NoteCallout>
      ) : null}

      <BranchOperatorPanel
        title={stockCopy.table.currentStock}
        size="sm"
        badge={{
          children: stockCopy.filters.resultSummary(
            filtered.length,
            ingredients.length,
          ),
          variant: "secondary",
        }}
        contentClassName="gap-3"
      >
        {coreDataLoadFailed ? (
          <AppEmptyState
            compact
            mode="error"
            title={stockCopy.loadFailed}
            description={stockCopy.loadFailedDescription}
            symbol="riceGrain"
          >
            <Button type="button" size="touch" onClick={() => router.refresh()}>
              {ACTIONS_VI.retry}
            </Button>
          </AppEmptyState>
        ) : isFirstLoadEmpty ? (
          <AppEmptyState
            compact
            title={stockCopy.empty.firstLoadTitle}
            description={stockCopy.empty.firstLoadHint}
            symbol="riceGrain"
          >
            {attentionCtas[0] ? (
              <Button
                size="touch"
                render={<Link href={attentionCtas[0].href} />}
              >
                {(() => {
                  const Icon = attentionCtas[0].icon;
                  return <Icon />;
                })()}
                {attentionCtas[0].label}
              </Button>
            ) : null}
          </AppEmptyState>
        ) : (
          <>
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                <InputGroup className="min-h-12 min-w-0 flex-1">
                  <InputGroupAddon>
                    <IconSearch />
                  </InputGroupAddon>
                  <InputGroupInput
                    aria-label={stockCopy.filters.searchPlaceholder}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={stockCopy.filters.searchPlaceholder}
                    inputMode="search"
                  />
                </InputGroup>

                <div className="flex min-w-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    className="min-w-0 flex-1 justify-between sm:w-auto sm:min-w-32"
                    onClick={openFilterSheet}
                  >
                    <span className="inline-flex items-center gap-2">
                      <IconFilter />
                      {ACTIONS_VI.filter}
                      {facetCount > 0 ? (
                        <Badge variant="secondary">{facetCount}</Badge>
                      ) : null}
                    </span>
                  </Button>
                  {secondaryJobs.length > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="touch"
                      className="shrink-0"
                      aria-label={stockCopy.actions.moreStockJobs}
                      onClick={() => setMoreJobsOpen(true)}
                    >
                      <IconMoreJobs />
                    </Button>
                  ) : null}
                </div>
              </div>

              <ToggleGroup
                type="single"
                value={status === "low" ? "in_stock" : status}
                onValueChange={(next) => {
                  if (
                    next === "in_stock" ||
                    next === "out" ||
                    next === "all"
                  ) {
                    setStatus(next);
                  }
                }}
                variant="outline"
                size="touch"
                className="grid w-full grid-cols-3"
                aria-label={stockCopy.filters.statusPlaceholder}
              >
                <ToggleGroupItem value="in_stock">
                  {stockCopy.filters.inStock}
                </ToggleGroupItem>
                <ToggleGroupItem value="out">
                  {stockCopy.filters.out}
                </ToggleGroupItem>
                <ToggleGroupItem value="all">
                  {stockCopy.filters.all}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {filtersActive ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="touch"
                  onClick={resetFilters}
                >
                  <IconReset />
                  {ACTIONS_VI.clearFilters}
                </Button>
              </div>
            ) : null}

            {filtered.length === 0 ? (
              <AppEmptyState
                compact
                mode={filtersActive ? "no-results" : "no-data"}
                title={
                  filtersActive
                    ? stockCopy.empty.search
                    : stockCopy.empty.noData
                }
                description={
                  filtersActive
                    ? stockCopy.empty.searchDescription
                    : stockCopy.empty.noDataDescription
                }
                symbol="riceGrain"
              >
                {filtersActive ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    onClick={resetFilters}
                  >
                    <IconReset />
                    {ACTIONS_VI.clearFilters}
                  </Button>
                ) : null}
              </AppEmptyState>
            ) : (
              <div role="list" className="flex flex-col">
                {filtered.map((item) => (
                  <StockTouchRow
                    key={item.id}
                    branchId={branchId}
                    item={item}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </BranchOperatorPanel>

      <AppSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        title={stockCopy.filterSheet.title}
        description={stockCopy.filterSheet.description}
        side="bottom"
        footerClassName="grid grid-cols-2 gap-2"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="touch"
              onClick={() => {
                setDraftCategories([]);
              }}
            >
              <IconReset />
              {ACTIONS_VI.clearFilters}
            </Button>
            <Button type="button" size="touch" onClick={applyFilters}>
              {stockCopy.actions.applyFilters}
            </Button>
          </>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <MultiSelectCombobox
            options={multiSelectOptions}
            onConfirm={(selected) => {
              setDraftCategories((current) =>
                normalizeStockOnHandCategories([...current, ...selected]),
              );
            }}
            triggerLabel={stockCopy.filterSheet.categoryMultiLabel}
            confirmLabel={stockCopy.filterSheet.categoryConfirm}
            searchPlaceholder={stockCopy.filters.categoryPlaceholder}
            triggerClassName="min-h-12 w-full"
          />
        </div>

        {normalizeStockOnHandCategories(draftCategories).length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              {stockCopy.filterSheet.selectedCategories}
            </p>
            <div className="flex flex-wrap gap-2">
              {normalizeStockOnHandCategories(draftCategories).map((value) => (
                <Badge key={value} variant="secondary" className="gap-2 pr-1">
                  {categoryLabel(value)}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`${ACTIONS_VI.remove} ${categoryLabel(value)}`}
                    onClick={() => removeCategory(value)}
                  >
                    <IconX />
                  </Button>
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </AppSheet>

      <AppSheet
        open={moreJobsOpen}
        onOpenChange={setMoreJobsOpen}
        title={stockCopy.moreJobsSheet.title}
        description={stockCopy.moreJobsSheet.description}
        side="bottom"
      >
        <div className="grid grid-cols-2 gap-2">
          {secondaryJobs.map((job) => {
            const Icon = secondaryJobIcon(job.key);
            return (
              <Button
                key={job.key}
                size="touch-lg"
                variant="outline"
                className="w-full whitespace-normal"
                render={<Link href={job.href} />}
              >
                <Icon data-icon="inline-start" />
                {job.title}
              </Button>
            );
          })}
        </div>
      </AppSheet>
    </BranchOperatorPage>
  );
}
