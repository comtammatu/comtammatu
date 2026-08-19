"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown as IconChevronDown,
  Eye as IconEye,
  EyeOff as IconEyeOff,
  Link2 as IconLink,
  MapPin as IconMapPin,
  Pencil as IconPencil,
  Plus as IconPlus,
  Search as IconSearch,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { InteractiveCard } from "@comtammatu/ui/components/interactive-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
import { cn } from "@comtammatu/ui";
import { useFormControlSize } from "@/components/form/control-size";
import {
  AppListFrame,
  AppPage,
  AppPageHeader,
  AppToolbar,
} from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { StatusBadge } from "@/components/status-badge";
import { formatVND } from "@lib/inventory/format";
import {
  CATEGORY_TONE_CLASS,
  ITEM_KIND_LABELS,
  ITEM_KIND_OPTIONS,
} from "../_lib/constants";
import { toggleIngredientActive } from "../ingredient-actions";
import {
  IngredientDialog,
  type IngredientSavedDetail,
} from "./ingredient-dialog";
import type {
  CategoryOption,
  IngredientRow,
  UnitOption,
} from "@lib/inventory/types";
import {
  getDisplayReferenceCost,
  type ReferenceCost,
} from "@lib/inventory/reference-cost";
import {
  resolveCatalogReadiness,
  summarizeCatalogReadiness,
  type CatalogReadinessGap,
} from "@lib/inventory/catalog-readiness";
import { resolveFulfillSiteFlags } from "@lib/inventory/fulfill-site";
import {
  applyIngredientsListFilterPatch,
  filterIngredientListRows,
  hasIngredientsListFilters,
  INGREDIENTS_ALL_KINDS,
  INGREDIENTS_DEFAULT_PAGE_SIZE,
  parseIngredientsListFilters,
  supplierCatalogLinkHref,
  type IngredientsActiveFilter,
  type IngredientsListFilterPatch,
  type IngredientsReadinessFilter,
} from "@lib/inventory/ingredients-list-model";

import {
  ACTIONS_VI,
  FORM_VI,
  INVENTORY_VI,
  PRODUCT_VI,
} from "@comtammatu/shared/messages";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { messages } from "@lib/messages";
import { inventoryListFilterSelectClassName } from "../_components/inventory-list-filters";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";

const ingredientFormCopy = messages.inventoryMaster.ingredientForm;
const ingredientListCopy = messages.inventory.ingredients.list;
const dialogCopy = messages.inventory.ingredients.dialog;
const activeOptions = [
  { value: "active", label: ingredientListCopy.activeOnly },
  { value: "all", label: ingredientListCopy.includeHidden },
];
const readinessFilterOptions: {
  value: IngredientsReadinessFilter;
  label: string;
}[] = [
  { value: "all", label: ingredientListCopy.readinessAll },
  { value: "gaps", label: ingredientListCopy.readinessGapsOnly },
  {
    value: "missing_fulfill_site",
    label: ingredientListCopy.readinessMissingFulfillSite,
  },
  {
    value: "missing_supplier_link",
    label: ingredientListCopy.readinessMissingSupplier,
  },
];
const itemKindOptions = [
  {
    value: INGREDIENTS_ALL_KINDS,
    label: dialogCopy.itemKindLabel,
  },
  ...ITEM_KIND_OPTIONS,
] as const;

function toReadinessInput(item: IngredientRow) {
  return {
    isActive: item.is_active,
    defaultFulfillSiteKind: item.default_fulfill_site_kind,
    fulfillFromCentralSupply: item.fulfill_from_central_supply,
    fulfillFromCentralKitchen: item.fulfill_from_central_kitchen,
    hasActiveSupplierLink: item.has_active_supplier_link === true,
    itemKind: item.item_kind,
  };
}

function fulfillSiteLabel(item: IngredientRow): string | null {
  const flags = resolveFulfillSiteFlags({
    fulfillFromCentralSupply: item.fulfill_from_central_supply,
    fulfillFromCentralKitchen: item.fulfill_from_central_kitchen,
    defaultFulfillSiteKind: item.default_fulfill_site_kind,
  });
  if (flags.fulfillFromCentralSupply && flags.fulfillFromCentralKitchen) {
    return dialogCopy.defaultFulfillSiteKindBoth;
  }
  if (flags.fulfillFromCentralSupply) {
    return dialogCopy.defaultFulfillSiteKindCentralSupply;
  }
  if (flags.fulfillFromCentralKitchen) {
    return dialogCopy.defaultFulfillSiteKindCentralKitchen;
  }
  return null;
}

function ReadinessCell({
  item,
  canManage,
  onAssignFulfill,
  onLinkSupplier,
}: {
  item: IngredientRow;
  canManage: boolean;
  onAssignFulfill?: (item: IngredientRow) => void;
  onLinkSupplier?: (item: IngredientRow) => void;
}) {
  const fulfillLabel = fulfillSiteLabel(item);
  const { gaps } = resolveCatalogReadiness(toReadinessInput(item));
  const gapLabel = (gap: CatalogReadinessGap) =>
    gap === "missing_fulfill_site"
      ? ingredientListCopy.missingFulfillSite
      : ingredientListCopy.missingSupplierLink;

  if (!fulfillLabel && gaps.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {fulfillLabel ? (
        <Badge variant="secondary" className="text-xs">
          {fulfillLabel}
        </Badge>
      ) : null}
      {gaps.map((gap) => {
        const interactive =
          canManage &&
          ((gap === "missing_fulfill_site" && onAssignFulfill) ||
            (gap === "missing_supplier_link" && onLinkSupplier));
        if (!interactive) {
          return (
            <Badge key={gap} variant="destructive" className="text-xs">
              {gapLabel(gap)}
            </Badge>
          );
        }
        return (
          <Button
            key={gap}
            type="button"
            variant="destructive"
            size="xs"
            className="h-auto px-2 py-0.5 text-xs font-normal"
            aria-label={
              gap === "missing_fulfill_site"
                ? ingredientListCopy.gapFulfillAria(item.name)
                : ingredientListCopy.gapSupplierAria(item.name)
            }
            onClick={(event) => {
              event.stopPropagation();
              if (gap === "missing_fulfill_site") onAssignFulfill?.(item);
              else onLinkSupplier?.(item);
            }}
          >
            {gapLabel(gap)}
          </Button>
        );
      })}
    </div>
  );
}

function categoryLabel(item: IngredientRow): string | null {
  return item.category_name ?? item.category ?? null;
}

function itemKindLabel(item: IngredientRow): string {
  return ITEM_KIND_LABELS[item.item_kind] ?? UNKNOWN_LABEL_VI;
}

function categoryToneClass(
  category: string | null,
  toneMap: Map<string, string>,
): string {
  if (!category) return "bg-muted text-muted-foreground";
  return (
    toneMap.get(category) ??
    CATEGORY_TONE_CLASS[category] ??
    "bg-muted text-muted-foreground"
  );
}

function formatReferenceCost(cost: ReferenceCost): string {
  const unitSuffix = cost.unit ? `/${cost.unit}` : "";
  return `${formatVND(cost.value)}${unitSuffix}`;
}

function baseUnitLabel(item: IngredientRow): string {
  if (item.unit?.trim()) return item.unit;
  const base = item.units?.find((unit) => unit.is_base);
  return base?.unit_name?.trim() || base?.unit_code?.trim() || "—";
}

function IngredientMobileCard({
  item,
  toneMap,
  actions,
  canManage,
  onOpen,
  onAssignFulfill,
  onLinkSupplier,
}: {
  item: IngredientRow;
  toneMap: Map<string, string>;
  actions: RowActionItem[];
  canManage: boolean;
  onOpen?: (item: IngredientRow) => void;
  onAssignFulfill?: (item: IngredientRow) => void;
  onLinkSupplier?: (item: IngredientRow) => void;
}) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);
  const category = categoryLabel(item);
  const referenceCost = getDisplayReferenceCost(item);
  return (
    <InteractiveCard
      minHeight="tap"
      className={cn(
        "flex-col items-stretch gap-1 p-0",
        onOpen ? "cursor-pointer" : undefined,
      )}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen ? () => onOpen(item) : undefined}
      onKeyDown={
        onOpen
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen(item);
              }
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-1">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 truncate">{item.name}</p>
            <StatusBadge
              domain="inventory"
              value={item.is_active ? "active" : "suspended"}
              size="sm"
            />
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {item.sku ?? "—"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge
              className={cn("text-xs", categoryToneClass(category, toneMap))}
            >
              {category ?? ingredientFormCopy.category.none}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {itemKindLabel(item)}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {baseUnitLabel(item)}
            </Badge>
          </div>
          <div className="mt-2">
            <ReadinessCell
              item={item}
              canManage={canManage}
              onAssignFulfill={onAssignFulfill}
              onLinkSupplier={onLinkSupplier}
            />
          </div>
        </div>
        <div
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {actions.length > 0 ? (
            <RowActionsMenu
              items={actions}
              label={ingredientListCopy.rowActionsAria(item.name)}
              triggerSize={isTouchLayout ? "icon-touch" : "icon"}
            />
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {referenceCost ? (
            <span className="font-mono">
              {formatReferenceCost(referenceCost)}
            </span>
          ) : null}
        </div>
      </div>
    </InteractiveCard>
  );
}

export function IngredientsClient({
  initial,
  unitOptions,
  categoryOptions,
  canManage = false,
}: {
  initial: IngredientRow[];
  unitOptions: UnitOption[];
  categoryOptions: CategoryOption[];
  canManage?: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [searchDraft, setSearchDraft] = useState("");
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] =
    useState<IngredientRow | null>(null);
  const [focusField, setFocusField] = useState<
    "default_fulfill_site_kind" | undefined
  >(undefined);
  const [isPending, startTransition] = useTransition();
  const [openActionRowId, setOpenActionRowId] = useState<number | null>(null);
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);
  const controlSize = useFormControlSize();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deepLinkHandledRef = useRef(false);

  const filters = useMemo(
    () => parseIngredientsListFilters(searchParams),
    [searchParams],
  );

  const hasSecondaryFilters =
    filters.category !== "all" ||
    filters.itemKind !== INGREDIENTS_ALL_KINDS ||
    filters.active !== "active";

  useEffect(() => {
    setRows(initial);
  }, [initial]);

  useEffect(() => {
    setSearchDraft(filters.query);
  }, [filters.query]);

  useEffect(() => {
    if (hasSecondaryFilters) setMoreFiltersOpen(true);
  }, [hasSecondaryFilters]);

  const replaceListFilters = useCallback(
    (patch: IngredientsListFilterPatch) => {
      const next = applyIngredientsListFilterPatch(searchParams, {
        ...patch,
        // Reset page unless the patch explicitly sets it.
        page: patch.page !== undefined ? patch.page : 1,
      });
      const query = next.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (!canManage || deepLinkHandledRef.current) return;
    if (searchParams.get("mode") !== "edit") return;
    const rawId = searchParams.get("ingredientId");
    const ingredientId = rawId ? Number(rawId) : NaN;
    if (!Number.isInteger(ingredientId) || ingredientId <= 0) return;

    const row = rows.find((item) => item.id === ingredientId);
    if (!row) return;

    deepLinkHandledRef.current = true;
    setFocusField(undefined);
    setEditingIngredient(row);
    setDialogOpen(true);

    const next = new URLSearchParams(searchParams.toString());
    next.delete("ingredientId");
    next.delete("mode");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [canManage, pathname, rows, router, searchParams]);

  const toneMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categoryOptions) {
      if (c.tone_class) m.set(c.name, c.tone_class);
    }
    return m;
  }, [categoryOptions]);

  const categoryFilterOptions = useMemo(
    () => [
      { value: "all", label: ingredientFormCopy.category.all },
      ...categoryOptions.map((c) => ({ value: c.name, label: c.name })),
    ],
    [categoryOptions],
  );

  const readinessSummary = useMemo(
    () => summarizeCatalogReadiness(rows.map(toReadinessInput)),
    [rows],
  );

  const filtered = useMemo(
    () => filterIngredientListRows(rows, filters, toReadinessInput),
    [rows, filters],
  );

  const hasActiveFilters = hasIngredientsListFilters(filters);

  function clearFilters() {
    setSearchDraft("");
    replaceListFilters({
      q: null,
      category: null,
      kind: null,
      active: null,
      ready: null,
      page: 1,
    });
  }

  function commitSearch(nextQuery = searchDraft) {
    replaceListFilters({ q: nextQuery, page: 1 });
  }

  function handleSaved(detail: IngredientSavedDetail) {
    setRows((prev) => {
      const exists = prev.some((row) => row.id === detail.id);
      if (!exists) return [...prev, detail.row];
      return prev.map((row) => (row.id === detail.id ? detail.row : row));
    });
    router.refresh();

    if (detail.mode !== "create") return;

    const readiness = resolveCatalogReadiness(toReadinessInput(detail.row));
    if (readiness.gaps.includes("missing_fulfill_site")) {
      toast.message(ingredientListCopy.createNudgeFulfill, {
        action: {
          label: ingredientListCopy.assignFulfillAction,
          onClick: () => openEdit(detail.row, "default_fulfill_site_kind"),
        },
      });
      return;
    }
    if (readiness.gaps.includes("missing_supplier_link")) {
      toast.message(ingredientListCopy.createNudgeSupplier, {
        action: {
          label: ingredientListCopy.linkSupplierAction,
          onClick: () => {
            router.push(supplierCatalogLinkHref(detail.id));
          },
        },
      });
    }
  }

  function openCreate() {
    setFocusField(undefined);
    setEditingIngredient(null);
    setDialogOpen(true);
  }

  function openEdit(
    row: IngredientRow,
    nextFocusField?: "default_fulfill_site_kind",
  ) {
    setFocusField(nextFocusField);
    setEditingIngredient(row);
    setDialogOpen(true);
  }

  function linkSupplier(item: IngredientRow) {
    router.push(supplierCatalogLinkHref(item.id));
  }

  function handleDialogOpenChange(open: boolean) {
    setDialogOpen(open);
    if (!open) setFocusField(undefined);
  }

  function handleToggleActive(item: IngredientRow) {
    startTransition(async () => {
      const result = await toggleIngredientActive({ id: item.id });
      if (!result.success) {
        toast.error(result.error ?? ingredientListCopy.toggleFailed);
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.id === item.id ? { ...r, is_active: !r.is_active } : r,
        ),
      );
      toast.success(
        item.is_active
          ? ingredientListCopy.hiddenToast(item.name)
          : ingredientListCopy.shownToast(item.name),
      );
      router.refresh();
    });
  }

  const getIngredientRowActions = (item: IngredientRow): RowActionItem[] => {
    if (!canManage) return [];
    const readiness = resolveCatalogReadiness(toReadinessInput(item));
    const items: RowActionItem[] = [
      {
        key: "edit",
        label: ACTIONS_VI.edit,
        icon: <IconPencil />,
        onSelect: () => openEdit(item),
      },
    ];
    if (readiness.gaps.includes("missing_fulfill_site")) {
      items.push({
        key: "assign-fulfill",
        label: ingredientListCopy.assignFulfillAction,
        icon: <IconMapPin />,
        onSelect: () => openEdit(item, "default_fulfill_site_kind"),
      });
    }
    if (readiness.gaps.includes("missing_supplier_link")) {
      items.push({
        key: "link-supplier",
        label: ingredientListCopy.linkSupplierAction,
        icon: <IconLink />,
        onSelect: () => linkSupplier(item),
      });
    }
    items.push({
      key: "toggle-active",
      label: item.is_active
        ? ingredientListCopy.hideAction
        : ingredientListCopy.showAction,
      icon: item.is_active ? <IconEyeOff /> : <IconEye />,
      disabled: isPending,
      separatorBefore: true,
      onSelect: () => handleToggleActive(item),
    });
    return items;
  };

  const filterSelectClassName =
    controlSize === "touch" ? "w-full" : inventoryListFilterSelectClassName;

  const filterBar = (
    <div className="flex min-w-0 flex-col">
      <AppToolbar
        variant="inline"
        search={
          <InputGroup
            size={isTouchLayout ? "touch" : "field"}
            className="min-w-0 flex-1 sm:min-w-72"
          >
            <InputGroupAddon>
              <IconSearch />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label={ingredientListCopy.searchPlaceholder}
              name="ingredient-search"
              inputMode="search"
              autoComplete="off"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitSearch();
                }
              }}
              onBlur={() => commitSearch()}
              placeholder={ingredientListCopy.searchPlaceholder}
            />
          </InputGroup>
        }
        filters={
          <>
            <Select
              value={filters.readiness}
              onValueChange={(value) => {
                replaceListFilters({
                  ready: value as IngredientsReadinessFilter,
                  page: 1,
                });
              }}
            >
              <SelectTrigger
                size={controlSize}
                className={filterSelectClassName}
                aria-label={ingredientListCopy.colReadiness}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {readinessFilterOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    size={controlSize === "touch" ? "touch" : "default"}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size={controlSize}
              aria-expanded={moreFiltersOpen}
              onClick={() => setMoreFiltersOpen((open) => !open)}
            >
              {moreFiltersOpen
                ? ingredientListCopy.moreFiltersHide
                : ingredientListCopy.moreFilters}
              <IconChevronDown
                data-icon="inline-end"
                className={cn(
                  "transition-transform",
                  moreFiltersOpen && "rotate-180",
                )}
              />
            </Button>
          </>
        }
        reset={
          <>
            <Badge variant="outline">
              {ingredientListCopy.countSummary(filtered.length, rows.length)}
            </Badge>
            {readinessSummary.gapCount > 0 ? (
              <Button
                type="button"
                variant="destructive"
                size={controlSize === "touch" ? "touch" : "sm"}
                aria-label={ingredientListCopy.readinessGapFilterAria}
                aria-pressed={filters.readiness === "gaps"}
                onClick={() =>
                  replaceListFilters({
                    ready: filters.readiness === "gaps" ? "all" : "gaps",
                    page: 1,
                  })
                }
              >
                {ingredientListCopy.readinessGapSummary(
                  readinessSummary.gapCount,
                  readinessSummary.activeCount,
                )}
              </Button>
            ) : null}
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="ghost"
                size={controlSize}
                onClick={clearFilters}
              >
                {ACTIONS_VI.clearFilters}
              </Button>
            ) : null}
          </>
        }
      />
      {moreFiltersOpen ? (
        <div className="flex flex-col gap-2 border-b border-border px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Select
            value={filters.category}
            onValueChange={(value) => {
              replaceListFilters({ category: value, page: 1 });
            }}
          >
            <SelectTrigger size={controlSize} className={filterSelectClassName}>
              <SelectValue placeholder={ingredientFormCopy.category.all} />
            </SelectTrigger>
            <SelectContent>
              {categoryFilterOptions.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  size={controlSize === "touch" ? "touch" : "default"}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.itemKind}
            onValueChange={(value) => {
              replaceListFilters({ kind: value, page: 1 });
            }}
          >
            <SelectTrigger size={controlSize} className={filterSelectClassName}>
              <SelectValue placeholder={dialogCopy.itemKindLabel} />
            </SelectTrigger>
            <SelectContent>
              {itemKindOptions.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  size={controlSize === "touch" ? "touch" : "default"}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.active}
            onValueChange={(value) => {
              replaceListFilters({
                active: value as IngredientsActiveFilter,
                page: 1,
              });
            }}
          >
            <SelectTrigger size={controlSize} className={filterSelectClassName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {activeOptions.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  size={controlSize === "touch" ? "touch" : "default"}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );

  const columns: DataTableColumn<IngredientRow>[] = [
    {
      key: "name",
      header: PRODUCT_VI.rawIngredient,
      className: "min-w-56",
      render: (item) => (
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="min-w-0 truncate">{item.name}</p>
            <StatusBadge
              domain="inventory"
              value={item.is_active ? "active" : "suspended"}
              size="sm"
            />
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {item.sku ?? "—"}
          </span>
        </div>
      ),
    },
    {
      key: "base_unit",
      header: ingredientListCopy.colBaseUnit,
      className: "min-w-28",
      render: (item) => (
        <span className="text-sm tabular-nums">{baseUnitLabel(item)}</span>
      ),
    },
    {
      key: "classification",
      header: messages.inventory.stock.table.kind,
      className: "min-w-40",
      render: (item) => {
        const category = categoryLabel(item);
        return (
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap gap-1.5">
              <Badge className={categoryToneClass(category, toneMap)}>
                {category ?? ingredientFormCopy.category.none}
              </Badge>
              <Badge variant="secondary">{itemKindLabel(item)}</Badge>
            </div>
          </div>
        );
      },
    },
    {
      key: "readiness",
      header: ingredientListCopy.colReadiness,
      className: "min-w-44",
      render: (item) => (
        <ReadinessCell
          item={item}
          canManage={canManage}
          onAssignFulfill={(row) =>
            openEdit(row, "default_fulfill_site_kind")
          }
          onLinkSupplier={linkSupplier}
        />
      ),
    },
    ...(rows.some((item) => item.monetary != null)
      ? [
          {
            key: "unit_cost",
            header: ingredientListCopy.colReferenceCost,
            className: "min-w-36 text-right",
            render: (item: IngredientRow) => {
              const referenceCost = getDisplayReferenceCost(item);
              return (
                <span className="font-mono tabular-nums">
                  {referenceCost ? formatReferenceCost(referenceCost) : "—"}
                </span>
              );
            },
          },
        ]
      : []),
    ...(canManage
      ? [
          {
            key: "actions",
            header: <span className="sr-only">{FORM_VI.action}</span>,
            className: "w-12 text-right",
            render: (item: IngredientRow) => {
              const items = getIngredientRowActions(item);
              return (
                <div
                  className="flex justify-end"
                  onClick={(event) => event.stopPropagation()}
                >
                  <RowActionsMenu
                    items={items}
                    label={ingredientListCopy.rowActionsAria(item.name)}
                    triggerSize="icon-sm"
                    open={openActionRowId === item.id}
                    onOpenChange={(open) =>
                      setOpenActionRowId(open ? item.id : null)
                    }
                  />
                </div>
              );
            },
          } satisfies DataTableColumn<IngredientRow>,
        ]
      : []),
  ];

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={PRODUCT_VI.rawIngredient}
        description={
          readinessSummary.gapCount > 0
            ? ingredientListCopy.readinessHint
            : undefined
        }
        actions={
          canManage ? (
            <Button type="button" size="lg" onClick={openCreate}>
              <IconPlus data-icon="inline-start" />
              {INVENTORY_VI.createRawIngredient}
            </Button>
          ) : undefined
        }
      />

      <AppListFrame toolbar={filterBar}>
        <DataTable
          columns={columns}
          data={filtered}
          getRowKey={(item) => item.id}
          emptyTitle={
            hasActiveFilters
              ? ingredientListCopy.emptyFiltered
              : ingredientListCopy.emptyTitle
          }
          emptyDescription={
            hasActiveFilters
              ? ingredientListCopy.emptyFilteredDescription
              : ingredientListCopy.emptyDescription
          }
          emptyMode={hasActiveFilters ? "no-results" : "no-data"}
          onRowClick={canManage ? openEdit : undefined}
          getRowDataState={(item) =>
            openActionRowId === item.id ? "selected" : undefined
          }
          renderRowContextMenu={
            canManage
              ? (item) => (
                  <RowActionsContextMenuItems
                    items={getIngredientRowActions(item)}
                  />
                )
              : undefined
          }
          mobileCardRender={(item) => (
            <IngredientMobileCard
              item={item}
              toneMap={toneMap}
              actions={getIngredientRowActions(item)}
              canManage={canManage}
              onOpen={canManage ? openEdit : undefined}
              onAssignFulfill={
                canManage
                  ? (row) => openEdit(row, "default_fulfill_site_kind")
                  : undefined
              }
              onLinkSupplier={canManage ? linkSupplier : undefined}
            />
          )}
          pageSize={INGREDIENTS_DEFAULT_PAGE_SIZE}
          currentPage={filters.page}
          onPageChange={(page) => replaceListFilters({ page })}
        />
      </AppListFrame>

      {canManage ? (
        <IngredientDialog
          open={dialogOpen}
          onOpenChange={handleDialogOpenChange}
          ingredient={editingIngredient}
          unitOptions={unitOptions}
          categoryOptions={categoryOptions}
          focusField={focusField}
          onSaved={handleSaved}
        />
      ) : null}
    </AppPage>
  );
}
