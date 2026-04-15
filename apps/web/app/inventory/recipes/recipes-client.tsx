"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, UtensilsCrossed } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { EmptyStatePanel } from "../_components/empty-state-panel";
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
  const className =
    value >= 95
      ? "bg-success/12 text-success"
      : value >= 80
        ? "bg-warning/12 text-warning"
        : "bg-destructive/12 text-destructive";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-1 text-xs font-bold",
        className,
      )}
    >
      {value}%
    </span>
  );
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
  const panelClassName = "rounded-lg border bg-card shadow-sm";
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
      <Card className="border-border/70">
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
          className={cn(panelClassName, "rounded-lg bg-card")}
          title="Chưa có công thức nào"
          description='Nhấn "Tạo món mới" để bắt đầu dựng định mức nguyên liệu.'
        />
      )}

      <div className="space-y-10">
        {recipes.map((recipe) => (
          <Card
            key={recipe.id}
            className={cn(panelClassName, "overflow-hidden rounded-lg bg-card")}
          >
            <CardContent className="p-5 md:p-6">
            {/* Recipe header */}
            <div
              className="-m-5 flex flex-wrap items-center justify-between gap-4 bg-muted px-5 py-5 md:-m-6 md:px-6"
            >
              <div className="min-w-0 flex items-center gap-4">
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
                  <UtensilsCrossed className="size-5 text-primary" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold sm:text-xl">
                      {recipe.name}
                    </h3>
                    <span className="shrink-0 whitespace-nowrap rounded-full bg-success/12 px-2 py-0.5 text-label font-bold uppercase tracking-wide text-success">
                      {recipe.category}
                    </span>
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
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-muted/40">
                    {[
                      "Nguyên liệu",
                      "Số lượng",
                      "Đơn vị",
                      "Yield Factor (%)",
                      "Ghi chú",
                    ].map((h) => (
                      <th
                        key={h}
                        className={`px-6 py-4 whitespace-nowrap text-xs font-bold uppercase tracking-wide ${h === "Yield Factor (%)" ? "text-center" : ""}`}
                        
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recipe.items.map((item) => (
                    <tr
                      key={item.ingredientId}
                      className="cursor-pointer border-b border-border transition-colors hover:bg-primary/3"
                      onClick={() => openEditLine(recipe.menuItemId, item)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="size-2 rounded-full bg-primary/40" />
                          <span className="font-semibold">
                            {item.ingredientName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono">
                        {item.qty}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {item.unit}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <YieldBadge value={item.yieldFactor} />
                      </td>
                      <td className="px-6 py-4 text-xs italic text-muted-foreground">
                        {item.note ?? "—"}
                      </td>
                    </tr>
                  ))}
                  {recipe.items.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-8 text-center text-sm text-muted-foreground"
                      >
                        Chưa có nguyên liệu. Nhấn &quot;Thêm dòng công
                        thức&quot; để bắt đầu.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Cost estimate footer */}
            <div
              className="flex items-center justify-between border-t border-border px-6 py-4"
            >
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
