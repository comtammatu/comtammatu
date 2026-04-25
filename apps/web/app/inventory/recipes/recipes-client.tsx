"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil as IconPencil, Plus as IconPlus } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { InventoryHeader } from "../_components/inventory-header";
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

  return (
    <>
      <InventoryHeader
        title="Định mức món bán"
        actions={
          <Button type="button" onClick={openCreate}>
            <IconPlus data-icon="inline-start" />
            Tạo định mức
          </Button>
        }
      />
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-7xl space-y-4">
          {recipes.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-base font-semibold">
                  Chưa có định mức món bán nào
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Định mức món bán là lượng nguyên liệu tiêu hao khi bán 1 phần
                  menu item. Nhấn &quot;Tạo định mức&quot; để bắt đầu.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="space-y-4">
            {recipes.map((recipe) => (
              <Card key={recipe.id} className="overflow-hidden">
                <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>{recipe.name}</CardTitle>
                    {recipe.category && (
                      <Badge variant="success">{recipe.category}</Badge>
                    )}
                    <span className="text-sm text-muted-foreground">
                      {recipe.items.length} nguyên liệu •{" "}
                      {formatVND(recipe.estimatedCost)} đ/phần
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(recipe)}
                  >
                    <IconPencil className="size-4" />
                    Sửa định mức
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nguyên liệu</TableHead>
                        <TableHead>Số lượng</TableHead>
                        <TableHead>Đơn vị</TableHead>
                        <TableHead className="text-center">Yield</TableHead>
                        <TableHead>Ghi chú</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recipe.items.map((item) => (
                        <TableRow key={item.ingredientId}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="size-2 rounded-full bg-primary/40" />
                              <span className="font-semibold">
                                {item.ingredientName}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono">
                            {item.qty}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {item.unit}
                          </TableCell>
                          <TableCell className="text-center">
                            <YieldBadge value={item.yieldFactor} />
                          </TableCell>
                          <TableCell className="text-xs italic text-muted-foreground">
                            {item.note ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>

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
        </div>
      </div>
    </>
  );
}
