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
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  AppPage,
  AppPageHeader,
  AppEmptyState,
  AppToolbar,
} from "@/components/surface";
import { formatVND } from "../_lib/format";
import { RecipeLineDialog } from "./recipe-line-dialog";
import type {
  MenuItemOption,
  IngredientOption,
  RecipeLineDraft,
} from "./recipe-line-dialog";

export type RecipeItem = {
  ingredientId: number;
  ingredientName: string;
  qty: number;
  unit: string;
  entryUnitId: number | null;
  yieldFactor: number;
  note: string | null;
  lineCost: number;
};

export type RecipeRow = {
  id: number;
  menuItemId: number;
  name: string;
  category: string;
  updatedAt: string;
  estimatedCost: number;
  items: RecipeItem[];
};

export function RecipesClient({
  recipes,
  menuItems,
  ingredients,
  stockCapacityByMenuItemId = {},
}: {
  recipes: RecipeRow[];
  menuItems: MenuItemOption[];
  ingredients: IngredientOption[];
  stockCapacityByMenuItemId?: Record<string, number>;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMenuItemId, setEditingMenuItemId] = useState<
    number | undefined
  >();
  const [editingLines, setEditingLines] = useState<RecipeLineDraft[]>([]);
  const [search, setSearch] = useState("");

  const existingMenuItemIds = useMemo(
    () => recipes.map((r) => r.menuItemId),
    [recipes],
  );

  const filteredRecipes = useMemo(() => {
    const query = search.trim();
    if (!query) return recipes;
    return recipes.filter((recipe) =>
      matchesSearch([recipe.name, recipe.category], query),
    );
  }, [recipes, search]);

  const showNoResults = filteredRecipes.length === 0 && search.trim().length > 0;

  function openCreate() {
    setEditingMenuItemId(undefined);
    setEditingLines([]);
    setDialogOpen(true);
  }

  function openEdit(recipe: RecipeRow) {
    setEditingMenuItemId(recipe.menuItemId);
    setEditingLines(
      recipe.items.map((item) => ({
        ingredientId: item.ingredientId,
        quantity: item.qty,
        unit: item.unit,
        entryUnitId: item.entryUnitId,
        yieldFactor: item.yieldFactor,
        note: item.note,
      })),
    );
    setDialogOpen(true);
  }

  function handleSaved() {
    router.refresh();
  }

  const columns: DataTableColumn<RecipeRow>[] = [
    {
      key: "name",
      header: INVENTORY_VI.recipeColMenuItem,
      render: (recipe) => <span className="font-semibold">{recipe.name}</span>,
    },
    {
      key: "category",
      header: INVENTORY_VI.recipeColCategory,
      render: (recipe) =>
        recipe.category ? (
          <Badge variant="success">{recipe.category}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "ingredientCount",
      header: INVENTORY_VI.recipeColIngredientCount,
      className: "font-mono",
      render: (recipe) => recipe.items.length,
    },
    {
      key: "cost",
      header: INVENTORY_VI.recipeColUnitCost,
      className: "font-mono",
      render: (recipe) =>
        INVENTORY_VI.amountDong(formatVND(recipe.estimatedCost)),
    },
    {
      key: "stockCapacity",
      header: INVENTORY_VI.recipeColStockCapacity,
      className: "font-mono",
      render: (recipe) => {
        const capacity = stockCapacityByMenuItemId[String(recipe.menuItemId)];
        return capacity == null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          capacity
        );
      },
    },
    {
      key: "actions",
      header: "",
      className: "w-32",
      render: (recipe) => (
        <div className="flex items-center justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openEdit(recipe)}
          >
            <IconPencil className="size-4" />
            {INVENTORY_VI.recipeEditAction}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={INVENTORY_VI.recipesPageTitle}
        actions={
          <Button type="button" onClick={openCreate}>
            <IconPlus data-icon="inline-start" />
            {INVENTORY_VI.recipeCreateAction}
          </Button>
        }
      />
      {recipes.length === 0 ? (
        <AppEmptyState
          mode="no-data"
          title={INVENTORY_VI.recipesEmptyTitle}
          description={INVENTORY_VI.recipesEmptyDescription}
        />
      ) : (
        <>
          <AppToolbar
            search={
              <InputGroup className="min-w-0 flex-1">
                <InputGroupAddon>
                  <IconSearch />
                </InputGroupAddon>
                <InputGroupInput
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={INVENTORY_VI.recipeSearchPlaceholder}
                />
              </InputGroup>
            }
          />
          <DataTable
            columns={columns}
            data={filteredRecipes}
            getRowKey={(recipe) => recipe.id}
            emptyTitle={
              showNoResults
                ? INVENTORY_VI.recipesEmptyFiltered
                : INVENTORY_VI.recipesEmptyTitle
            }
            emptyMode={showNoResults ? "no-results" : "no-data"}
            mobileCardRender={(recipe) => (
              <RecipeCard
                recipe={recipe}
                stockCapacity={
                  stockCapacityByMenuItemId[String(recipe.menuItemId)]
                }
                onEdit={openEdit}
              />
            )}
          />
        </>
      )}

      <RecipeLineDialog
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

function RecipeCard({
  recipe,
  stockCapacity,
  onEdit,
}: {
  recipe: RecipeRow;
  stockCapacity: number | undefined;
  onEdit: (recipe: RecipeRow) => void;
}) {
  return (
    <Item variant="outline">
      <ItemHeader>
        <ItemTitle>{recipe.name}</ItemTitle>
        {recipe.category ? (
          <Badge variant="success">{recipe.category}</Badge>
        ) : null}
      </ItemHeader>
      <ItemContent>
        <ItemDescription>
          {INVENTORY_VI.recipeCardSummary(
            recipe.items.length,
            formatVND(recipe.estimatedCost),
          )}
        </ItemDescription>
        <ItemDescription>
          {INVENTORY_VI.recipeColStockCapacity}:{" "}
          {stockCapacity == null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="font-mono">{stockCapacity}</span>
          )}
        </ItemDescription>
      </ItemContent>
      <ItemFooter>
        <ItemActions>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onEdit(recipe)}
          >
            <IconPencil className="size-4" />
            {INVENTORY_VI.recipeEditAction}
          </Button>
        </ItemActions>
      </ItemFooter>
    </Item>
  );
}
