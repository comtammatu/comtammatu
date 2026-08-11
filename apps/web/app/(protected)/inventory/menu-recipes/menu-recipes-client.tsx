/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
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
import type { MenuRecipeCostSignal } from "../_lib/menu-recipe-cost";
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

function menuRecipeCostSignalLabel(signal: MenuRecipeCostSignal): string {
  switch (signal) {
    case "missing_fulfill_site":
      return INVENTORY_VI.menuRecipeMissingFulfillSite;
    case "missing_source_wac":
      return INVENTORY_VI.menuRecipeMissingSourceWac;
    default: {
      const _exhaustive: never = signal;
      return _exhaustive;
    }
  }
}

function MenuRecipeCostSignalBadges({
  signals,
}: {
  signals: readonly MenuRecipeCostSignal[];
}) {
  if (signals.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {signals.map((signal) => (
        <Badge key={signal} variant="destructive" className="text-xs">
          {menuRecipeCostSignalLabel(signal)}
        </Badge>
      ))}
    </div>
  );
}

export type MenuRecipeRow = {
  id: number;
  menuItemId: number;
  name: string;
  category: string;
  updatedAt: string;
  estimatedCost: number | null;
  items: MenuRecipeItem[];
};

export function MenuRecipesClient({
  menuRecipes,
  menuItems,
  ingredients,
  stockCapacityByMenuItemId = {},
  loadError,
}: {
  menuRecipes: MenuRecipeRow[];
  menuItems: MenuItemOption[];
  ingredients: IngredientOption[];
  stockCapacityByMenuItemId?: Record<string, number>;
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

  const existingMenuItemIds = useMemo(
    () => menuRecipes.map((menuRecipe) => menuRecipe.menuItemId),
    [menuRecipes],
  );

  const filteredMenuRecipes = useMemo(() => {
    const query = search.trim();
    if (!query) return menuRecipes;
    return menuRecipes.filter((menuRecipe) =>
      matchesSearch([menuRecipe.name, menuRecipe.category], query),
    );
  }, [menuRecipes, search]);

  const showNoResults =
    filteredMenuRecipes.length === 0 && search.trim().length > 0;

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
      label: INVENTORY_VI.menuRecipeEditAction,
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
      header: "Định mức",
      className: "min-w-48",
      render: (menuRecipe) => (
        <div className="flex flex-col gap-1 text-sm">
          {menuRecipe.items.length === 0 ? (
            <span className="text-muted-foreground italic">
              Chưa có định mức
            </span>
          ) : (
            menuRecipe.items.map((item, i) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">
                    {item.ingredientName}
                  </span>
                  <span className="font-mono">
                    {item.qty} {item.unitLabel}
                  </span>
                </div>
                <MenuRecipeCostSignalBadges signals={item.costSignals} />
              </div>
            ))
          )}
        </div>
      ),
    },
    {
      key: "cost",
      header: INVENTORY_VI.menuRecipeColUnitCost,
      className: "font-mono",
      render: (menuRecipe) => {
        const rowSignals = [
          ...new Set(menuRecipe.items.flatMap((item) => item.costSignals)),
        ];
        return (
          <div className="flex flex-col items-start gap-1">
            {menuRecipe.estimatedCost == null ? (
              <span className="text-muted-foreground">
                {INVENTORY_VI.menuRecipeCostUnavailable}
              </span>
            ) : (
              INVENTORY_VI.amountDong(formatVND(menuRecipe.estimatedCost))
            )}
            <MenuRecipeCostSignalBadges signals={rowSignals} />
          </div>
        );
      },
    },
    {
      key: "stockCapacity",
      header: INVENTORY_VI.menuRecipeColStockCapacity,
      className: "font-mono",
      render: (menuRecipe) => {
        const capacity =
          stockCapacityByMenuItemId[String(menuRecipe.menuItemId)];
        return capacity == null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          capacity
        );
      },
    },
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
  actions,
  onOpen,
}: {
  menuRecipe: MenuRecipeRow;
  stockCapacity: number | undefined;
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
          {menuRecipe.estimatedCost == null
            ? INVENTORY_VI.menuRecipeCardSummaryNoCost(menuRecipe.items.length)
            : INVENTORY_VI.menuRecipeCardSummary(
                menuRecipe.items.length,
                formatVND(menuRecipe.estimatedCost),
              )}
        </ItemDescription>
        <div className="flex flex-col gap-1 rounded-md bg-muted/30 p-2 text-sm mt-2 mb-2">
          {menuRecipe.items.length === 0 ? (
            <span className="text-muted-foreground italic">
              Chưa có định mức
            </span>
          ) : (
            menuRecipe.items.map((item, i) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">
                    {item.ingredientName}
                  </span>
                  <span className="font-mono">
                    {item.qty} {item.unitLabel}
                  </span>
                </div>
                <MenuRecipeCostSignalBadges signals={item.costSignals} />
              </div>
            ))
          )}
        </div>
        <ItemDescription>
          {INVENTORY_VI.menuRecipeColStockCapacity}:{" "}
          {stockCapacity == null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="font-mono">{stockCapacity}</span>
          )}
        </ItemDescription>
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
