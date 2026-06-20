"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: inventory recipe list keeps kitchen workflow copy inline */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil as IconPencil, Plus as IconPlus } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  AppPage,
  AppPageHeader,
  AppEmptyState,
  AppSection,
} from "@/components/surface";
import { formatVND } from "../_lib/format";
import { RecipeLineDialog } from "./recipe-line-dialog";
import type {
  MenuItemOption,
  IngredientOption,
  RecipeLineDraft,
} from "./recipe-line-dialog";

import { FORM_VI, PRODUCT_VI } from "@comtammatu/shared/messages";
export type RecipeItem = {
  ingredientId: number;
  ingredientName: string;
  qty: number;
  unit: string;
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

function YieldBadge({ value }: { value: number }) {
  // yield_factor is stored as a multiplier (0.85 = 15% loss, 1.0 = no loss)
  const pct = Math.round(value * 100);
  const variant = pct >= 95 ? "success" : pct >= 80 ? "warning" : "destructive";
  return <Badge variant={variant}>{pct}%</Badge>;
}

export function RecipesClient({
  recipes,
  menuItems,
  ingredients,
}: {
  recipes: RecipeRow[];
  menuItems: MenuItemOption[];
  ingredients: IngredientOption[];
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMenuItemId, setEditingMenuItemId] = useState<
    number | undefined
  >();
  const [editingLines, setEditingLines] = useState<RecipeLineDraft[]>([]);

  const existingMenuItemIds = useMemo(
    () => recipes.map((r) => r.menuItemId),
    [recipes],
  );

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
        yieldFactor: item.yieldFactor,
        note: item.note,
      })),
    );
    setDialogOpen(true);
  }

  function handleSaved() {
    router.refresh();
  }

  const recipeItemColumns: DataTableColumn<RecipeItem>[] = [
    {
      key: "ingredient",
      header: PRODUCT_VI.rawIngredient,
      render: (item) => (
        <div className="flex items-center gap-2">
          <div className="size-2 rounded-full bg-primary/40" />
          <span className="font-semibold">{item.ingredientName}</span>
        </div>
      ),
    },
    {
      key: "quantity",
      header: FORM_VI.quantity,
      className: "font-mono",
      render: (item) => item.qty,
    },
    {
      key: "unit",
      header: FORM_VI.unit,
      className: "text-muted-foreground",
      render: (item) => item.unit,
    },
    {
      key: "yield",
      header: "Yield",
      className: "text-center",
      render: (item) => <YieldBadge value={item.yieldFactor} />,
    },
    {
      key: "note",
      header: FORM_VI.notes,
      className: "max-w-xs text-xs italic text-muted-foreground",
      render: (item) => (
        <span className="line-clamp-2 break-words">{item.note ?? "—"}</span>
      ),
    },
  ];

  return (
    <AppPage scroll>
      <AppPageHeader
        title="Định mức món bán"
        actions={
          <Button type="button" onClick={openCreate}>
            <IconPlus data-icon="inline-start" />
            Tạo định mức
          </Button>
        }
      />
      {recipes.length === 0 && (
        <AppEmptyState
          mode="no-data"
          title="Chưa có định mức món bán nào"
          description='Định mức món bán là lượng nguyên liệu tiêu hao khi bán 1 phần menu item. Nhấn "Tạo định mức" để bắt đầu.'
        />
      )}

      {recipes.map((recipe) => (
          <AppSection
            key={recipe.id}
            title={recipe.name}
            badge={
              recipe.category
                ? { children: recipe.category, variant: "success" }
                : undefined
            }
            headerHint={`${recipe.items.length} nguyên liệu · ${formatVND(recipe.estimatedCost)} đ/phần`}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openEdit(recipe)}
              >
                <IconPencil className="size-4" />
                Sửa định mức
              </Button>
            }
            contentFlush
          >
            <DataTable
              columns={recipeItemColumns}
              data={recipe.items}
              getRowKey={(item) => item.ingredientId}
              mobileCardRender={(item) => <RecipeItemCard item={item} />}
            />
          </AppSection>
        ))}

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

function RecipeItemCard({ item }: { item: RecipeItem }) {
  return (
    <Item variant="outline">
      <ItemHeader>
        <ItemTitle>{item.ingredientName}</ItemTitle>
        <YieldBadge value={item.yieldFactor} />
      </ItemHeader>
      <ItemContent>
        <ItemDescription>
          {item.qty} {item.unit} · {item.note ?? "Không ghi chú"}
        </ItemDescription>
      </ItemContent>
    </Item>
  );
}
