"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
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
  EditingLine,
} from "./recipe-line-dialog";

export type RecipeItem = {
  ingredientId: number;
  ingredientName: string;
  qty: number;
  unit: string;
  yieldFactor: number;
  note: string | null;
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
  const variant =
    value >= 95 ? "success" : value >= 80 ? "warning" : "destructive";
  return <Badge variant={variant}>{value}%</Badge>;
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
  const [lineDialogOpen, setLineDialogOpen] = useState(false);
  const [lineDialogMenuItemId, setLineDialogMenuItemId] = useState<
    number | undefined
  >();
  const [editingLine, setEditingLine] = useState<EditingLine | null>(null);

  function openAddLine(menuItemId?: number) {
    setEditingLine(null);
    setLineDialogMenuItemId(menuItemId);
    setLineDialogOpen(true);
  }

  function openEditLine(menuItemId: number, item: RecipeItem) {
    setEditingLine({
      menuItemId,
      ingredientId: item.ingredientId,
      quantity: item.qty,
      unit: item.unit,
      yieldFactor: item.yieldFactor,
      note: item.note,
    });
    setLineDialogMenuItemId(menuItemId);
    setLineDialogOpen(true);
  }

  function handleSaved() {
    router.refresh();
  }

  return (
    <>
      <InventoryHeader
        title="Công thức món"
        actions={
          <Button type="button" onClick={() => openAddLine()}>
            + Tạo món mới
          </Button>
        }
      />
      <div className="flex-1 overflow-auto p-4">
      <div className="mx-auto max-w-7xl space-y-4">

      {recipes.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-base font-semibold">Chưa có công thức nào</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Nhấn "Tạo món mới" để bắt đầu dựng định mức nguyên liệu.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {recipes.map((recipe) => (
          <Card key={recipe.id} className="overflow-hidden">
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-2">
                <CardTitle>{recipe.name}</CardTitle>
                <Badge variant="success">{recipe.category}</Badge>
                <span className="text-sm text-muted-foreground">
                  {formatVND(recipe.estimatedCost)} đ/phần
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => openAddLine(recipe.menuItemId)}
                  aria-label={`Sửa ${recipe.name}`}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  type="button"
                  onClick={() => openAddLine(recipe.menuItemId)}
                  variant="outline"
                  size="sm"
                >
                  + Thêm dòng
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nguyên liệu</TableHead>
                    <TableHead>Số lượng</TableHead>
                    <TableHead>Đơn vị</TableHead>
                    <TableHead className="text-center">
                      Yield Factor (%)
                    </TableHead>
                    <TableHead>Ghi chú</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipe.items.map((item) => (
                    <TableRow
                      key={item.ingredientId}
                      className="cursor-pointer"
                      onClick={() => openEditLine(recipe.menuItemId, item)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="size-2 rounded-full bg-primary/40" />
                          <span className="font-semibold">
                            {item.ingredientName}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{item.qty}</TableCell>
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
                  {recipe.items.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        Chưa có nguyên liệu. Nhấn &quot;Thêm dòng công
                        thức&quot; để bắt đầu.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>

      <RecipeLineDialog
        open={lineDialogOpen}
        onOpenChange={setLineDialogOpen}
        menuItems={menuItems}
        ingredients={ingredients}
        defaultMenuItemId={lineDialogMenuItemId}
        editingLine={editingLine}
        onSaved={handleSaved}
      />
    </div>
    </div>
    </>
  );
}
