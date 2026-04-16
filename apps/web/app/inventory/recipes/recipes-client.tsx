"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, UtensilsCrossed } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { EmptyStatePanel } from "@/components/patterns";
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
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-2xl">Công thức món ăn</CardTitle>
            <CardDescription>
              Định mức nguyên liệu cho từng món.
            </CardDescription>
          </div>
          <Button
            type="button"
            onClick={() => openAddLine()}
            className="shadow-lg"
          >
            + Tạo món mới
          </Button>
        </CardHeader>
      </Card>

      {recipes.length === 0 && (
        <EmptyStatePanel
          title="Chưa có công thức nào"
          description='Nhấn "Tạo món mới" để bắt đầu dựng định mức nguyên liệu.'
        />
      )}

      <div className="space-y-10">
        {recipes.map((recipe) => (
          <Card key={recipe.id} className="overflow-hidden">
            <CardContent className="p-5 md:p-6">
              {/* Recipe header */}
              <div className="-m-5 flex flex-wrap items-center justify-between gap-4 bg-muted px-5 py-5 md:-m-6 md:px-6">
                <div className="min-w-0 flex items-center gap-4">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
                    <UtensilsCrossed className="size-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold sm:text-xl">
                        {recipe.name}
                      </h3>
                      <Badge variant="success">
                        {recipe.category}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Cập nhật {recipe.updatedAt}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
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
                    className="text-primary"
                  >
                    + Thêm dòng công thức
                  </Button>
                </div>
              </div>

              {/* Ingredients table */}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="whitespace-nowrap text-xs font-bold uppercase tracking-wide">
                        Nguyên liệu
                      </TableHead>
                      <TableHead className="whitespace-nowrap text-xs font-bold uppercase tracking-wide">
                        Số lượng
                      </TableHead>
                      <TableHead className="whitespace-nowrap text-xs font-bold uppercase tracking-wide">
                        Đơn vị
                      </TableHead>
                      <TableHead className="whitespace-nowrap text-center text-xs font-bold uppercase tracking-wide">
                        Yield Factor (%)
                      </TableHead>
                      <TableHead className="whitespace-nowrap text-xs font-bold uppercase tracking-wide">
                        Ghi chú
                      </TableHead>
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
              </div>

              {/* Cost estimate footer */}
              <div className="flex items-center justify-between border-t border-border px-6 py-4">
                <span className="text-xs font-medium uppercase tracking-tight text-muted-foreground">
                  Giá vốn tạm tính:{" "}
                  <span className="font-bold text-primary">
                    {formatVND(recipe.estimatedCost)} đ
                  </span>{" "}
                  / phần
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recipe Line Dialog */}
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
  );
}
