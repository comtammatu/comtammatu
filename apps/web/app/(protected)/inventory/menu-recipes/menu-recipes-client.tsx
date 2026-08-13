"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Pencil as IconPencil,
  Plus as IconPlus,
  Search as IconSearch,
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
import { useFormControlSize } from "@/components/form/control-size";
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
  ItemFooter,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { matchesSearch } from "@lib/search";
import { FORM_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import {
  AppEmptyState,
  AppListFrame,
  AppPage,
  AppPageHeader,
  AppToolbar,
} from "@/components/surface";
import { formatVND } from "@lib/inventory/format";
import { MenuRecipeLineDialog } from "./menu-recipe-line-dialog";
import type {
  MenuItemOption,
  IngredientOption,
  MenuRecipeLineDraft,
} from "./menu-recipe-line-dialog";
import {
  resolveMenuRecipeListCostState,
  type MenuRecipeCostSignal,
} from "../_lib/menu-recipe-cost";
import { inventoryListFilterSelectClassName } from "../_components/inventory-list-filters";
import { messages } from "@lib/messages";

export type MenuRecipeItem = {
  ingredientId: number;
  ingredientName: string;
  qty: number;
  unitLabel: string;
  entryUnitId: number | null;
  note: string | null;
  lineCost: number | null;
  costSignals: readonly MenuRecipeCostSignal[];
};

export type MenuRecipeRow = {
  id: number;
  menuItemId: number;
  name: string;
  category: string;
  updatedAt: string;
  estimatedCost: number | null;
  items: MenuRecipeItem[];
};

type CoverageFilter = "all" | "missing" | "awaiting_cost";

const COVERAGE_ALL: CoverageFilter = "all";

function menuRecipeRowSignals(
  menuRecipe: MenuRecipeRow,
): MenuRecipeCostSignal[] {
  return [...new Set(menuRecipe.items.flatMap((item) => item.costSignals))];
}

function menuRecipeListCostLabel(
  menuRecipe: MenuRecipeRow,
  wacMapAvailable: boolean,
): string {
  const state = resolveMenuRecipeListCostState({
    itemCount: menuRecipe.items.length,
    estimatedCost: menuRecipe.estimatedCost,
    signals: menuRecipeRowSignals(menuRecipe),
    wacMapAvailable,
  });
  switch (state.kind) {
    case "amount":
      return INVENTORY_VI.amountDong(formatVND(state.amount));
    case "missing_recipe":
      return INVENTORY_VI.menuRecipeMissingLines;
    case "missing_fulfill_site":
      return INVENTORY_VI.menuRecipeMissingFulfillSite;
    case "missing_source_wac":
      return INVENTORY_VI.menuRecipeMissingSourceWac;
    case "source_wac_site_mismatch":
      return INVENTORY_VI.menuRecipeSourceWacSiteMismatch;
    case "unavailable":
      return INVENTORY_VI.menuRecipeCostUnavailable;
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

function isAwaitingCost(
  menuRecipe: MenuRecipeRow,
  wacMapAvailable: boolean,
): boolean {
  const state = resolveMenuRecipeListCostState({
    itemCount: menuRecipe.items.length,
    estimatedCost: menuRecipe.estimatedCost,
    signals: menuRecipeRowSignals(menuRecipe),
    wacMapAvailable,
  });
  return state.kind !== "amount" && state.kind !== "missing_recipe";
}

export function MenuRecipesClient({
  menuRecipes,
  menuItems,
  ingredients,
  stockCapacityByMenuItemId = {},
  showStockCapacity = false,
  wacMapAvailable = true,
  loadError,
}: {
  menuRecipes: MenuRecipeRow[];
  menuItems: MenuItemOption[];
  ingredients: IngredientOption[];
  stockCapacityByMenuItemId?: Record<string, number>;
  showStockCapacity?: boolean;
  wacMapAvailable?: boolean;
  loadError?: string | null;
}) {
  const router = useRouter();
  const controlSize = useFormControlSize();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMenuItemId, setEditingMenuItemId] = useState<
    number | undefined
  >();
  const [editingLines, setEditingLines] = useState<MenuRecipeLineDraft[]>([]);
  const [search, setSearch] = useState("");
  const [coverage, setCoverage] = useState<CoverageFilter>(COVERAGE_ALL);

  const existingMenuItemIds = useMemo(
    () =>
      menuRecipes
        .filter((menuRecipe) => menuRecipe.items.length > 0)
        .map((menuRecipe) => menuRecipe.menuItemId),
    [menuRecipes],
  );

  const filteredMenuRecipes = useMemo(() => {
    const query = search.trim();
    return menuRecipes.filter((menuRecipe) => {
      if (
        query &&
        !matchesSearch([menuRecipe.name, menuRecipe.category], query)
      ) {
        return false;
      }
      if (coverage === "missing") return menuRecipe.items.length === 0;
      if (coverage === "awaiting_cost") {
        return isAwaitingCost(menuRecipe, wacMapAvailable);
      }
      return true;
    });
  }, [menuRecipes, search, coverage, wacMapAvailable]);

  const showNoResults =
    filteredMenuRecipes.length === 0 &&
    (search.trim().length > 0 || coverage !== COVERAGE_ALL);

  function openCreate() {
    setEditingMenuItemId(undefined);
    setEditingLines([]);
    setDialogOpen(true);
  }

  function openEdit(menuRecipe: MenuRecipeRow) {
    setEditingMenuItemId(menuRecipe.menuItemId);
    setEditingLines(
      menuRecipe.items.map((item) => ({
        ingredientId: item.ingredientId,
        quantity: item.qty,
        unitLabel: item.unitLabel,
        entryUnitId: item.entryUnitId,
        note: item.note,
      })),
    );
    setDialogOpen(true);
  }

  function handleSaved() {
    router.refresh();
  }

  const getMenuRecipeRowActions = (
    menuRecipe: MenuRecipeRow,
  ): RowActionItem[] => [
    {
      key: "edit",
      label:
        menuRecipe.items.length > 0
          ? INVENTORY_VI.menuRecipeEditAction
          : INVENTORY_VI.menuRecipeCreateAction,
      icon: <IconPencil />,
      onSelect: () => openEdit(menuRecipe),
    },
  ];

  const columns: DataTableColumn<MenuRecipeRow>[] = [
    {
      key: "name",
      header: INVENTORY_VI.menuRecipeColMenuItem,
      render: (menuRecipe) => <span>{menuRecipe.name}</span>,
    },
    {
      key: "category",
      header: INVENTORY_VI.menuRecipeColCategory,
      render: (menuRecipe) =>
        menuRecipe.category ? (
          <Badge variant="success">{menuRecipe.category}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "ingredients",
      header: INVENTORY_VI.menuRecipeColIngredientCount,
      render: (menuRecipe) =>
        menuRecipe.items.length === 0 ? (
          <span className="text-muted-foreground">
            {INVENTORY_VI.menuRecipeMissingLines}
          </span>
        ) : (
          INVENTORY_VI.menuRecipeLineCount(menuRecipe.items.length)
        ),
    },
    {
      key: "cost",
      header: INVENTORY_VI.menuRecipeColUnitCost,
      render: (menuRecipe) => {
        const state = resolveMenuRecipeListCostState({
          itemCount: menuRecipe.items.length,
          estimatedCost: menuRecipe.estimatedCost,
          signals: menuRecipeRowSignals(menuRecipe),
          wacMapAvailable,
        });
        return (
          <span
            className={
              state.kind === "amount"
                ? "font-mono"
                : "text-muted-foreground"
            }
          >
            {menuRecipeListCostLabel(menuRecipe, wacMapAvailable)}
          </span>
        );
      },
    },
    ...(showStockCapacity
      ? [
          {
            key: "stockCapacity",
            header: INVENTORY_VI.menuRecipeColStockCapacity,
            className: "font-mono",
            render: (menuRecipe: MenuRecipeRow) => {
              const capacity =
                stockCapacityByMenuItemId[String(menuRecipe.menuItemId)];
              return capacity == null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                capacity
              );
            },
          } satisfies DataTableColumn<MenuRecipeRow>,
        ]
      : []),
    {
      key: "actions",
      header: FORM_VI.action,
      className: "w-14",
      render: (menuRecipe) => {
        const items = getMenuRecipeRowActions(menuRecipe);
        return (
          <div
            className="flex justify-end"
            onClick={(event) => event.stopPropagation()}
          >
            <RowActionsMenu
              items={items}
              label={FORM_VI.action}
              triggerSize="icon-sm"
            />
          </div>
        );
      },
    },
  ];

  if (loadError) {
    return (
      <AppPage width="xwide" density="compact">
        <AppPageHeader title={INVENTORY_VI.menuRecipesPageTitle} />
        <AppEmptyState
          mode="error"
          title={messages.inventory.menuRecipes.loadFailedTitle}
          description={loadError}
        />
      </AppPage>
    );
  }

  const listToolbar = (
    <AppToolbar
      variant="inline"
      search={
        <InputGroup size={controlSize} className="min-w-0 flex-1 sm:min-w-72">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label={INVENTORY_VI.menuRecipeSearchPlaceholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={INVENTORY_VI.menuRecipeSearchPlaceholder}
          />
        </InputGroup>
      }
      filters={
        <Select
          value={coverage}
          onValueChange={(value) => setCoverage(value as CoverageFilter)}
        >
          <SelectTrigger
            size="field"
            className={inventoryListFilterSelectClassName}
            aria-label={INVENTORY_VI.menuRecipeCoverageFilterAria}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {INVENTORY_VI.menuRecipeCoverageAll}
            </SelectItem>
            <SelectItem value="missing">
              {INVENTORY_VI.menuRecipeCoverageMissing}
            </SelectItem>
            <SelectItem value="awaiting_cost">
              {INVENTORY_VI.menuRecipeCoverageAwaitingCost}
            </SelectItem>
          </SelectContent>
        </Select>
      }
      reset={
        <Badge variant="outline">
          {filteredMenuRecipes.length}/{menuRecipes.length}
        </Badge>
      }
    />
  );

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={INVENTORY_VI.menuRecipesPageTitle}
        actions={
          <Button type="button" size="lg" onClick={openCreate}>
            <IconPlus data-icon="inline-start" />
            {INVENTORY_VI.menuRecipeCreateAction}
          </Button>
        }
      />
      <AppListFrame toolbar={listToolbar}>
        <DataTable
          columns={columns}
          data={filteredMenuRecipes}
          pageSize={25}
          getRowKey={(menuRecipe) => menuRecipe.id}
          onRowClick={openEdit}
          renderRowContextMenu={(menuRecipe) => (
            <RowActionsContextMenuItems
              items={getMenuRecipeRowActions(menuRecipe)}
            />
          )}
          emptyTitle={
            showNoResults
              ? INVENTORY_VI.menuRecipesEmptyFiltered
              : INVENTORY_VI.menuRecipesEmptyTitle
          }
          emptyDescription={
            showNoResults ? undefined : INVENTORY_VI.menuRecipesEmptyDescription
          }
          emptyMode={showNoResults ? "no-results" : "no-data"}
          mobileCardRender={(menuRecipe) => (
            <MenuRecipeCard
              menuRecipe={menuRecipe}
              stockCapacity={
                stockCapacityByMenuItemId[String(menuRecipe.menuItemId)]
              }
              showStockCapacity={showStockCapacity}
              wacMapAvailable={wacMapAvailable}
              actions={getMenuRecipeRowActions(menuRecipe)}
              onOpen={openEdit}
            />
          )}
        />
      </AppListFrame>

      <MenuRecipeLineDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        menuItems={menuItems}
        ingredients={ingredients}
        editingMenuItemId={editingMenuItemId}
        editingLines={editingLines}
        existingMenuItemIds={existingMenuItemIds}
        onSaved={handleSaved}
      />
    </AppPage>
  );
}

function MenuRecipeCard({
  menuRecipe,
  stockCapacity,
  showStockCapacity,
  wacMapAvailable,
  actions,
  onOpen,
}: {
  menuRecipe: MenuRecipeRow;
  stockCapacity: number | undefined;
  showStockCapacity: boolean;
  wacMapAvailable: boolean;
  actions: RowActionItem[];
  onOpen: (menuRecipe: MenuRecipeRow) => void;
}) {
  const controlSize = useFormControlSize();

  return (
    <Item variant="outline" onClick={() => onOpen(menuRecipe)}>
      <ItemHeader>
        <ItemTitle>{menuRecipe.name}</ItemTitle>
        {menuRecipe.category ? (
          <Badge variant="success">{menuRecipe.category}</Badge>
        ) : null}
      </ItemHeader>
      <ItemContent>
        <ItemDescription>
          {menuRecipe.items.length === 0
            ? INVENTORY_VI.menuRecipeMissingLines
            : INVENTORY_VI.menuRecipeLineCount(menuRecipe.items.length)}
        </ItemDescription>
        <ItemDescription>
          {INVENTORY_VI.menuRecipeColUnitCost}:{" "}
          {menuRecipeListCostLabel(menuRecipe, wacMapAvailable)}
        </ItemDescription>
        {showStockCapacity ? (
          <ItemDescription>
            {INVENTORY_VI.menuRecipeColStockCapacity}:{" "}
            {stockCapacity == null ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span className="font-mono">{stockCapacity}</span>
            )}
          </ItemDescription>
        ) : null}
      </ItemContent>
      <ItemFooter>
        <ItemActions>
          <div onClick={(event) => event.stopPropagation()}>
            <RowActionsMenu
              items={actions}
              label={FORM_VI.action}
              triggerSize={controlSize === "touch" ? "icon-touch" : "icon"}
            />
          </div>
        </ItemActions>
      </ItemFooter>
    </Item>
  );
}
