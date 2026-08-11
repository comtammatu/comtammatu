"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Eye as IconEye,
  EyeOff as IconEyeOff,
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
import { matchesSearch } from "@lib/search";
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
import {
  fetchIngredients,
  toggleIngredientActive,
} from "../ingredient-actions";
import { IngredientDialog } from "./ingredient-dialog";
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
  catalogReadinessHasGap,
  resolveCatalogReadiness,
  summarizeCatalogReadiness,
  type CatalogReadinessGap,
} from "@lib/inventory/catalog-readiness";

import {
  ACTIONS_VI,
  FORM_VI,
  INVENTORY_VI,
  PRODUCT_VI,
} from "@comtammatu/shared/messages";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { messages } from "@lib/messages";
import {
  inventoryListFilterSelectClassName,
} from "../_components/inventory-list-filters";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";

const ingredientFormCopy = messages.inventoryMaster.ingredientForm;
const ingredientListCopy = messages.inventory.ingredients.list;
const activeOptions = [
  { value: "active", label: ingredientListCopy.activeOnly },
  { value: "all", label: ingredientListCopy.includeHidden },
];
type ReadinessFilter =
  | "all"
  | "gaps"
  | "missing_fulfill_site"
  | "missing_supplier_link";
const readinessFilterOptions: {
  value: ReadinessFilter;
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
const allItemKindsValue = "all";
const itemKindOptions = [
  {
    value: allItemKindsValue,
    label: messages.inventory.ingredients.dialog.itemKindLabel,
  },
  ...ITEM_KIND_OPTIONS,
] as const;

function toReadinessInput(item: IngredientRow) {
  return {
    isActive: item.is_active,
    defaultFulfillSiteKind: item.default_fulfill_site_kind,
    hasActiveSupplierLink: item.has_active_supplier_link === true,
  };
}

function ReadinessBadges({ item }: { item: IngredientRow }) {
  const { gaps } = resolveCatalogReadiness(toReadinessInput(item));
  if (gaps.length === 0) return null;
  const label = (gap: CatalogReadinessGap) =>
    gap === "missing_fulfill_site"
      ? ingredientListCopy.missingFulfillSite
      : ingredientListCopy.missingSupplierLink;
  return (
    <div className="flex flex-wrap gap-1.5">
      {gaps.map((gap) => (
        <Badge key={gap} variant="destructive" className="text-xs">
          {label(gap)}
        </Badge>
      ))}
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

function ThresholdBadges({ item }: { item: IngredientRow }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="destructive">Min {item.min_stock_level ?? 0}</Badge>
    </div>
  );
}

function IngredientMobileCard({
  item,
  toneMap,
  actions,
  onOpen,
}: {
  item: IngredientRow;
  toneMap: Map<string, string>;
  actions: RowActionItem[];
  onOpen?: (item: IngredientRow) => void;
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
          </div>
          <div className="mt-2">
            <ReadinessBadges item={item} />
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
      <div className="flex flex-col gap-2 px-4 py-2 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">
            {ingredientListCopy.colThresholds}
          </p>
          <ThresholdBadges item={item} />
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
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [itemKind, setItemKind] = useState(allItemKindsValue);
  const [activeFilter, setActiveFilter] = useState<"active" | "all">("active");
  const [readinessFilter, setReadinessFilter] =
    useState<ReadinessFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] =
    useState<IngredientRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const [openActionRowId, setOpenActionRowId] = useState<number | null>(null);
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);
  const controlSize = useFormControlSize();

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

  const filtered = useMemo(() => {
    let result = rows;
    if (activeFilter === "active") {
      result = result.filter((item) => item.is_active);
    }
    if (category !== "all") {
      result = result.filter((item) => categoryLabel(item) === category);
    }
    if (itemKind !== allItemKindsValue) {
      result = result.filter((item) => item.item_kind === itemKind);
    }
    if (readinessFilter !== "all") {
      const gap =
        readinessFilter === "gaps"
          ? "any"
          : (readinessFilter as CatalogReadinessGap);
      result = result.filter((item) =>
        catalogReadinessHasGap(toReadinessInput(item), gap),
      );
    }
    if (searchQuery.trim()) {
      result = result.filter((item) =>
        matchesSearch([item.name, item.sku], searchQuery),
      );
    }
    return result;
  }, [rows, activeFilter, category, itemKind, readinessFilter, searchQuery]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    category !== "all" ||
    itemKind !== allItemKindsValue ||
    activeFilter !== "active" ||
    readinessFilter !== "all";

  function clearFilters() {
    setSearchQuery("");
    setCategory("all");
    setItemKind(allItemKindsValue);
    setActiveFilter("active");
    setReadinessFilter("all");
    setCurrentPage(1);
  }

  async function reload() {
    try {
      // Full reload keeps Nguồn hàng + NCC readiness flags in sync after save.
      const response = await fetchIngredients(2000);
      if (response.success) {
        setRows((response.data ?? []) as IngredientRow[]);
        return;
      }
      toast.error(response.error ?? ingredientListCopy.reloadFailed);
    } catch {
      toast.error(ingredientListCopy.reloadFailed);
    }
  }

  function openCreate() {
    setEditingIngredient(null);
    setDialogOpen(true);
  }

  function openEdit(row: IngredientRow) {
    setEditingIngredient(row);
    setDialogOpen(true);
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
    });
  }

  const getIngredientRowActions = (item: IngredientRow): RowActionItem[] => {
    if (!canManage) return [];
    return [
      {
        key: "edit",
        label: ACTIONS_VI.edit,
        icon: <IconPencil />,
        onSelect: () => openEdit(item),
      },
      {
        key: "toggle-active",
        label: item.is_active
          ? ingredientListCopy.hideAction
          : ingredientListCopy.showAction,
        icon: item.is_active ? <IconEyeOff /> : <IconEye />,
        disabled: isPending,
        separatorBefore: true,
        onSelect: () => handleToggleActive(item),
      },
    ];
  };

  const filterBar = (
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
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setCurrentPage(1);
            }}
            placeholder={ingredientListCopy.searchPlaceholder}
          />
        </InputGroup>
      }
      filters={
        <>
          <Select
            value={category}
            onValueChange={(value) => {
              setCategory(value);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger
              size={controlSize}
              className={
                controlSize === "touch"
                  ? "w-full"
                  : inventoryListFilterSelectClassName
              }
            >
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
            value={itemKind}
            onValueChange={(value) => {
              setItemKind(value);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger
              size={controlSize}
              className={
                controlSize === "touch"
                  ? "w-full"
                  : inventoryListFilterSelectClassName
              }
            >
              <SelectValue
                placeholder={
                  messages.inventory.ingredients.dialog.itemKindLabel
                }
              />
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
            value={activeFilter}
            onValueChange={(value) => {
              setActiveFilter(value as "active" | "all");
              setCurrentPage(1);
            }}
          >
            <SelectTrigger
              size={controlSize}
              className={
                controlSize === "touch"
                  ? "w-full"
                  : inventoryListFilterSelectClassName
              }
            >
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

          <Select
            value={readinessFilter}
            onValueChange={(value) => {
              setReadinessFilter(value as ReadinessFilter);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger
              size={controlSize}
              className={
                controlSize === "touch"
                  ? "w-full"
                  : inventoryListFilterSelectClassName
              }
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
        </>
      }
      reset={
        <>
          <Badge variant="outline">
            {ingredientListCopy.countSummary(filtered.length, rows.length)}
          </Badge>
          {readinessSummary.gapCount > 0 ? (
            <Badge variant="destructive">
              {ingredientListCopy.readinessGapSummary(
                readinessSummary.gapCount,
                readinessSummary.activeCount,
              )}
            </Badge>
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
      key: "thresholds",
      header: ingredientListCopy.colThresholds,
      className: "min-w-40",
      render: (item) => (
        <div className="flex flex-col gap-1">
          <ThresholdBadges item={item} />
        </div>
      ),
    },
    {
      key: "readiness",
      header: ingredientListCopy.colReadiness,
      className: "min-w-44",
      render: (item) => <ReadinessBadges item={item} />,
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
            searchQuery.trim()
              ? ingredientListCopy.emptyFiltered
              : ingredientListCopy.emptyTitle
          }
          emptyDescription={
            searchQuery.trim()
              ? ingredientListCopy.emptyFilteredDescription
              : ingredientListCopy.emptyDescription
          }
          emptyMode={searchQuery.trim() ? "no-results" : "no-data"}
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
              onOpen={canManage ? openEdit : undefined}
            />
          )}
          pageSize={25}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
        />
      </AppListFrame>

      {canManage ? (
        <IngredientDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          ingredient={editingIngredient}
          unitOptions={unitOptions}
          categoryOptions={categoryOptions}
          onSaved={reload}
        />
      ) : null}
    </AppPage>
  );
}
