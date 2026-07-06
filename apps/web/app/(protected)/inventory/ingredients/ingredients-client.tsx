"use client";

import { useMemo, useState, useTransition, useRef } from "react";
import {
  Ellipsis as IconDots,
  Eye as IconEye,
  EyeOff as IconEyeOff,
  Pencil as IconPencil,
  Search as IconSearch,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import { toast } from "@comtammatu/ui/components/sonner";
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
import { cn } from "@comtammatu/ui";
import { matchesSearch } from "@lib/search";
import {
  AppPageHeader,
  AppPage,
  AppSection,
  AppToolbar,
} from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { StatusBadge } from "@/components/status-badge";
import { formatVND } from "../_lib/format";
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
import type { CategoryOption, IngredientRow, UnitOption } from "../_lib/types";
import { IngredientImportExportMenu } from "./import-export-menu";

import {
  ACTIONS_VI,
  FORM_VI,
  INVENTORY_VI,
  PRODUCT_VI,
} from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";

const ingredientFormCopy = messages.inventoryMaster.ingredientForm;
const ingredientListCopy = messages.inventory.ingredients.list;
const preservationOptions = [
  { value: "all", label: ingredientListCopy.preservationAll },
  { value: "refrigerated", label: ingredientListCopy.preservationRefrigerated },
  { value: "frozen", label: ingredientListCopy.preservationFrozen },
  { value: "ambient", label: ingredientListCopy.preservationAmbient },
];

const activeOptions = [
  { value: "active", label: ingredientListCopy.activeOnly },
  { value: "all", label: ingredientListCopy.includeHidden },
];
const allItemKindsValue = "all";
const itemKindOptions = [
  {
    value: allItemKindsValue,
    label: messages.inventory.ingredients.dialog.itemKindLabel,
  },
  ...ITEM_KIND_OPTIONS,
] as const;

function storageLabel(type: string | null): string {
  if (type === "refrigerated") return "0–4°C";
  if (type === "frozen") return "−18°C";
  return ingredientListCopy.storageAmbient;
}

const conversionNumberFormatter = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 6,
});

function categoryLabel(item: IngredientRow): string | null {
  return item.category_name ?? item.category ?? null;
}

function itemKindLabel(item: IngredientRow): string {
  return ITEM_KIND_LABELS[item.item_kind] ?? item.item_kind;
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

function unitsSummary(item: IngredientRow): string {
  const units = item.units ?? [];
  if (units.length === 0) {
    // Fall back to ingredient columns when no multi-unit rows are present yet.
    if (item.purchase_unit) {
      return `${item.purchase_unit} (${ingredientFormCopy.units.baseTag})`;
    }
    return "—";
  }
  return units
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((u) =>
      u.is_base
        ? `${u.unit_code} (${ingredientFormCopy.units.baseTag})`
        : `${u.unit_code} ×${conversionNumberFormatter.format(u.to_base_factor)}`,
    )
    .join(" · ");
}

function ThresholdBadges({ item }: { item: IngredientRow }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="destructive">Min {item.min_stock_level ?? 0}</Badge>
      <Badge variant="secondary">Max {item.max_stock_level ?? 0}</Badge>
      <Badge variant="success">Re {item.reorder_point ?? 0}</Badge>
    </div>
  );
}

function IngredientMobileCard({
  item,
  isPending,
  toneMap,
  onToggleActive,
  onEdit,
}: {
  item: IngredientRow;
  isPending: boolean;
  toneMap: Map<string, string>;
  onToggleActive: (item: IngredientRow) => void;
  onEdit: (item: IngredientRow) => void;
}) {
  const category = categoryLabel(item);
  return (
    <InteractiveCard
      minHeight="tap"
      className="flex-col items-stretch gap-0 p-0"
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-1">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold">{item.name}</p>
            {category ? (
              <Badge
                className={cn("text-xs", categoryToneClass(category, toneMap))}
              >
                {category}
              </Badge>
            ) : null}
            <Badge variant="secondary" className="text-xs">
              {itemKindLabel(item)}
            </Badge>
            <StatusBadge
              domain="inventory"
              value={item.is_active ? "active" : "suspended"}
              size="sm"
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.sku ?? "—"} &middot; {unitsSummary(item)}
          </p>
        </div>
      </div>
      <div className="px-4 py-1">
        <ThresholdBadges item={item} />
      </div>
      <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{storageLabel(item.storage_type)}</span>
          {item.unit_cost != null ? (
            <span className="font-mono">{formatVND(item.unit_cost)}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onToggleActive(item)}
            aria-label={
              item.is_active
                ? ingredientListCopy.hideAria(item.name)
                : ingredientListCopy.showAria(item.name)
            }
            disabled={isPending}
          >
            {item.is_active ? (
              <IconEyeOff className="size-4" />
            ) : (
              <IconEye className="size-4" />
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onEdit(item)}
            aria-label={ingredientListCopy.editAria(item.name)}
          >
            <IconPencil className="size-4" />
            <span className="ml-1">{ACTIONS_VI.edit}</span>
          </Button>
        </div>
      </div>
    </InteractiveCard>
  );
}

export function IngredientsClient({
  initial,
  unitOptions,
  categoryOptions,
}: {
  initial: IngredientRow[];
  unitOptions: UnitOption[];
  categoryOptions: CategoryOption[];
}) {
  const [rows, setRows] = useState(initial);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [itemKind, setItemKind] = useState(allItemKindsValue);
  const [preservation, setPreservation] = useState("all");
  const [activeFilter, setActiveFilter] = useState<"active" | "all">("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] =
    useState<IngredientRow | null>(null);
  const [isPending, startTransition] = useTransition();

  const lastUpdatedAtRef = useRef<string | null>(null);

  // Initialize the water-mark cursor from initial rows
  if (lastUpdatedAtRef.current === null && initial.length > 0) {
    const timestamps = initial
      .map((r) => r.updated_at)
      .filter((t): t is string => !!t);
    if (timestamps.length > 0) {
      lastUpdatedAtRef.current = timestamps.reduce((latest, current) => 
        new Date(current) > new Date(latest) ? current : latest
      );
    }
  }

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
    if (preservation !== "all") {
      result = result.filter(
        (item) => (item.storage_type ?? "ambient") === preservation,
      );
    }
    if (searchQuery.trim()) {
      result = result.filter((item) =>
        matchesSearch([item.name, item.sku], searchQuery),
      );
    }
    return result;
  }, [rows, activeFilter, category, itemKind, preservation, searchQuery]);

  async function reload() {
    try {
      const response = await fetchIngredients(2000, lastUpdatedAtRef.current ?? undefined);
      if (response.success) {
        const delta = (response.data ?? []) as IngredientRow[];
        if (delta.length > 0) {
          setRows((prev) => {
            const next = [...prev];
            for (const item of delta) {
              const idx = next.findIndex((r) => r.id === item.id);
              if (idx !== -1) {
                next[idx] = item;
              } else {
                next.push(item);
              }
            }
            return next;
          });
          const timestamps = delta
            .map((r) => r.updated_at)
            .filter((t): t is string => !!t);
          if (timestamps.length > 0) {
            lastUpdatedAtRef.current = timestamps.reduce((latest, current) => 
              new Date(current) > new Date(latest) ? current : latest,
              lastUpdatedAtRef.current ?? timestamps[0]!
            );
          }
        }
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

  const filterBar = (
    <AppToolbar>
      <InputGroup className="h-10 flex-1">
        <InputGroupAddon>
          <IconSearch />
        </InputGroupAddon>
        <InputGroupInput
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={ingredientListCopy.searchPlaceholder}
        />
      </InputGroup>

      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder={ingredientFormCopy.category.all} />
        </SelectTrigger>
        <SelectContent>
          {categoryFilterOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={itemKind} onValueChange={setItemKind}>
        <SelectTrigger className="w-40">
          <SelectValue
            placeholder={messages.inventory.ingredients.dialog.itemKindLabel}
          />
        </SelectTrigger>
        <SelectContent>
          {itemKindOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={preservation} onValueChange={setPreservation}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder={ingredientListCopy.preservationAll} />
        </SelectTrigger>
        <SelectContent>
          {preservationOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={activeFilter}
        onValueChange={(value) => setActiveFilter(value as "active" | "all")}
      >
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {activeOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Badge variant="outline">
        {ingredientListCopy.countSummary(filtered.length, rows.length)}
      </Badge>
    </AppToolbar>
  );

  const columns: DataTableColumn<IngredientRow>[] = [
    {
      key: "name",
      header: PRODUCT_VI.rawIngredient,
      className: "min-w-52",
      render: (item) => {
        const category = categoryLabel(item);
        return (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold">{item.name}</p>
              {category ? (
                <Badge className={categoryToneClass(category, toneMap)}>
                  {category}
                </Badge>
              ) : null}
              <Badge variant="secondary">{itemKindLabel(item)}</Badge>
            </div>
            {item.sku ? (
              <span className="font-mono text-xs text-muted-foreground">
                {item.sku}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "unit",
      header: `${FORM_VI.unit} & ${ingredientListCopy.colStorage}`,
      className: "min-w-44",
      render: (item) => (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">
            {unitsSummary(item)}
          </span>
          <span className="text-xs text-muted-foreground">
            {storageLabel(item.storage_type)}
          </span>
        </div>
      ),
    },
    {
      key: "unit_cost",
      header: ingredientListCopy.colReferenceCost,
      className: "min-w-28 text-right",
      render: (item) => (
        <span className="font-mono">
          {item.unit_cost != null ? formatVND(item.unit_cost) : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: `${FORM_VI.status} & ${ingredientListCopy.colThresholds}`,
      className: "min-w-44",
      render: (item) => (
        <div className="flex flex-col gap-1.5">
          <div>
            <StatusBadge
              domain="inventory"
              value={item.is_active ? "active" : "suspended"}
              size="sm"
            />
          </div>
          <ThresholdBadges item={item} />
        </div>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">{FORM_VI.action}</span>,
      className: "w-12 text-right",
      render: (item) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={ingredientListCopy.rowActionsAria(item.name)}
              disabled={isPending}
            >
              <IconDots className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(item)}>
              <IconPencil className="mr-2 size-4" />
              {ACTIONS_VI.edit}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleToggleActive(item)}>
              {item.is_active ? (
                <>
                  <IconEyeOff className="mr-2 size-4" />
                  {ingredientListCopy.hideAction}
                </>
              ) : (
                <>
                  <IconEye className="mr-2 size-4" />
                  {ingredientListCopy.showAction}
                </>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <AppPage width="xwide" density="compact" scroll className="max-md:pb-28">
      <AppPageHeader
        eyebrow={messages.inventory.shell.moduleName}
        title={PRODUCT_VI.rawIngredient}
        actions={
          <div className="flex items-center gap-2">
            <IngredientImportExportMenu onImported={reload} />
            <Button type="button" onClick={openCreate}>
              {INVENTORY_VI.createRawIngredient}
            </Button>
          </div>
        }
      />
      {filterBar}

      <AppSection className="overflow-hidden" contentFlush>
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
          mobileCardRender={(item) => (
            <IngredientMobileCard
              item={item}
              isPending={isPending}
              toneMap={toneMap}
              onToggleActive={handleToggleActive}
              onEdit={openEdit}
            />
          )}
        />
      </AppSection>

      <IngredientDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        ingredient={editingIngredient}
        unitOptions={unitOptions}
        categoryOptions={categoryOptions}
        onSaved={reload}
      />
    </AppPage>
  );
}
