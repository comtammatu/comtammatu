"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, UtensilsCrossed } from "lucide-react";
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

  const totalLines = recipes.reduce(
    (sum, recipe) => sum + recipe.items.length,
    0,
  );
  const averageCost =
    recipes.length > 0
      ? Math.round(
          recipes.reduce((sum, recipe) => sum + recipe.estimatedCost, 0) /
            recipes.length,
        )
      : 0;

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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">
            Danh muc cong thuc
          </p>
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">
              Công thức món ăn
            </h1>
            <p className="text-sm text-muted-foreground">
              Dat recipe vao nhom danh muc de gia von, san xuat va tieu hao van
              hanh tu cung mot bo dinh muc.
            </p>
          </div>
        </div>
        <Button type="button" onClick={() => openAddLine()}>
          + Tạo món mới
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent>
          <Badge variant="secondary">
            Tổng công thức
          </Badge>
          <p className="mt-3 text-3xl font-semibold">{recipes.length}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Món đang có recipe để vận hành.
          </p>
        </CardContent></Card>
        <Card><CardContent>
          <Badge variant="secondary">
            Tổng dòng nguyên liệu
          </Badge>
          <p className="mt-3 text-3xl font-semibold">{totalLines}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Số cấu phần đã được chuẩn hóa trong bếp.
          </p>
        </CardContent></Card>
        <Card><CardContent>
          <Badge variant="secondary">
            Giá vốn bình quân
          </Badge>
          <p className="mt-3 text-3xl font-semibold">
            {formatVND(averageCost)} đ
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ước tính giá vốn trung bình trên mỗi recipe.
          </p>
        </CardContent></Card>
      </div>

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

      <div className="space-y-6">
        {recipes.map((recipe) => (
          <Card key={recipe.id} className="overflow-hidden">
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle>{recipe.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {`Cập nhật ${recipe.updatedAt}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="success">{recipe.category}</Badge>
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
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="mb-4 flex items-center gap-4 rounded-[1.75rem] border border-border/60 bg-background/75 p-4">
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
                  <UtensilsCrossed className="size-5 text-primary" />
                </div>
                <div className="grid flex-1 gap-2 md:grid-cols-3">
                  <div>
                    <Badge variant="secondary">
                      Danh mục
                    </Badge>
                    <p className="mt-1 text-sm font-medium">
                      {recipe.category}
                    </p>
                  </div>
                  <div>
                    <Badge variant="secondary">
                      Số dòng nguyên liệu
                    </Badge>
                    <p className="mt-1 text-sm font-medium">
                      {recipe.items.length}
                    </p>
                  </div>
                  <div>
                    <Badge variant="secondary">
                      Giá vốn tạm tính
                    </Badge>
                    <p className="mt-1 text-sm font-medium text-primary">
                      {formatVND(recipe.estimatedCost)} đ / phần
                    </p>
                  </div>
                </div>
              </div>

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
  );
}
