"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: inventory recipe list keeps kitchen workflow copy inline */

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
      header: "Món bán",
      render: (recipe) => <span className="font-semibold">{recipe.name}</span>,
    },
    {
      key: "category",
      header: "Nhóm",
      render: (recipe) =>
        recipe.category ? (
          <Badge variant="success">{recipe.category}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "ingredientCount",
      header: "Số nguyên liệu",
      className: "font-mono",
      render: (recipe) => recipe.items.length,
    },
    {
      key: "cost",
      header: "Giá vốn/phần",
      className: "font-mono",
      render: (recipe) => `${formatVND(recipe.estimatedCost)} đ`,
    },
    {
      key: "stockCapacity",
      header: "Phần bán được",
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
            Sửa định mức
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title="Định mức món bán"
        actions={
          <Button type="button" onClick={openCreate}>
            <IconPlus data-icon="inline-start" />
            Tạo định mức
          </Button>
        }
      />
      {recipes.length === 0 ? (
        <AppEmptyState
          mode="no-data"
          title="Chưa có định mức món bán nào"
          description='Định mức món bán là lượng nguyên liệu tiêu hao khi bán 1 phần menu item. Nhấn "Tạo định mức" để bắt đầu.'
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
                  placeholder="Tìm theo tên món hoặc nhóm"
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
                ? "Không tìm thấy định mức phù hợp"
                : "Chưa có định mức món bán nào"
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
          {recipe.items.length} nguyên liệu · {formatVND(recipe.estimatedCost)} đ/phần
        </ItemDescription>
        <ItemDescription>
          Phần bán được:{" "}
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
            Sửa định mức
          </Button>
        </ItemActions>
      </ItemFooter>
    </Item>
  );
}
