"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@comtammatu/ui/components/alert-dialog";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Textarea } from "@comtammatu/ui/components/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { cn } from "@comtammatu/ui";
import { toast } from "@comtammatu/ui/components/sonner";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { FormattedNumberInput } from "./_components/formatted-number-input";
import {
  deleteProductionRecipeGroup,
  deleteProductionRecipe,
  upsertProductionRecipe,
} from "./production-actions";
import {
  QuickFinishedGoodDialog,
  QuickRawIngredientDialog,
} from "./production-quick-create-dialogs";
import {
  badgeVariantFromTone,
  sortFinishedGoods,
  sortRawIngredients,
} from "./production-types";
import type {
  FinishedGoodOption,
  IngredientOption,
  ProductionRecipeGroup,
  ProductionRecipeRow,
  RawIngredientOption,
} from "./production-types";

/* ─── Main recipe panel ─── */

interface ProductionRecipePanelProps {
  canManageCatalog: boolean;
  finishedGoods: FinishedGoodOption[];
  ingredients: IngredientOption[];
  recipes: ProductionRecipeRow[];
}

export function ProductionRecipePanel({
  canManageCatalog,
  finishedGoods,
  ingredients,
  recipes,
}: ProductionRecipePanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [finishedGoodsOptions, setFinishedGoodsOptions] = useState<
    FinishedGoodOption[]
  >(() => sortFinishedGoods(finishedGoods));
  const [rawIngredientsOptions, setRawIngredientsOptions] = useState<
    RawIngredientOption[]
  >(() =>
    sortRawIngredients(
      ingredients
        .filter((ingredient) => ingredient.item_kind === "raw_material")
        .map((ingredient) => ({
          id: ingredient.id,
          name: ingredient.name,
          unit: ingredient.unit,
        })),
    ),
  );

  const [quickFinishedGoodDialogOpen, setQuickFinishedGoodDialogOpen] =
    useState(false);
  const [quickRawIngredientDialogOpen, setQuickRawIngredientDialogOpen] =
    useState(false);
  const [recipeDialogOpen, setRecipeDialogOpen] = useState(false);
  const [recipeError, setRecipeError] = useState<string | null>(null);
  const [editingRecipe, setEditingRecipe] =
    useState<ProductionRecipeRow | null>(null);
  const [recipeGroupToDelete, setRecipeGroupToDelete] =
    useState<ProductionRecipeGroup | null>(null);
  const [recipeFinishedGoodId, setRecipeFinishedGoodId] = useState(
    finishedGoodsOptions[0]?.id ? String(finishedGoodsOptions[0].id) : "",
  );
  const [recipeIngredientId, setRecipeIngredientId] = useState("");
  const [recipeQuantity, setRecipeQuantity] = useState("1");
  const [recipeUnit, setRecipeUnit] = useState("");
  const [recipeYieldFactor, setRecipeYieldFactor] = useState("1");
  const [recipeNote, setRecipeNote] = useState("");

  useEffect(() => {
    setFinishedGoodsOptions(sortFinishedGoods(finishedGoods));
  }, [finishedGoods]);

  useEffect(() => {
    setRawIngredientsOptions(
      sortRawIngredients(
        ingredients
          .filter((ingredient) => ingredient.item_kind === "raw_material")
          .map((ingredient) => ({
            id: ingredient.id,
            name: ingredient.name,
            unit: ingredient.unit,
          })),
      ),
    );
  }, [ingredients]);

  const groupedRecipes = useMemo<ProductionRecipeGroup[]>(() => {
    const groups = new Map<number, ProductionRecipeGroup>();

    for (const recipe of recipes) {
      const current = groups.get(recipe.finished_good_id);

      if (current) {
        current.lines.push(recipe);
        continue;
      }

      groups.set(recipe.finished_good_id, {
        finishedGoodId: recipe.finished_good_id,
        finishedGoodName: recipe.finished_good_name,
        lines: [recipe],
      });
    }

    return Array.from(groups.values()).sort((a, b) =>
      a.finishedGoodName.localeCompare(b.finishedGoodName, "vi"),
    );
  }, [recipes]);

  const canSubmitRecipe =
    Number.isFinite(Number(recipeFinishedGoodId)) &&
    Number(recipeFinishedGoodId) > 0 &&
    Number.isFinite(Number(recipeIngredientId)) &&
    Number(recipeIngredientId) > 0 &&
    Number.isFinite(Number(recipeQuantity)) &&
    Number(recipeQuantity) > 0 &&
    recipeUnit.trim().length > 0 &&
    Number.isFinite(Number(recipeYieldFactor)) &&
    Number(recipeYieldFactor) > 0;

  function resetRecipeForm() {
    setRecipeError(null);
    setEditingRecipe(null);
    setRecipeFinishedGoodId(
      finishedGoodsOptions[0]?.id ? String(finishedGoodsOptions[0].id) : "",
    );
    setRecipeIngredientId("");
    setRecipeQuantity("1");
    setRecipeUnit("");
    setRecipeYieldFactor("1");
    setRecipeNote("");
  }

  function handleRecipeDialogOpenChange(open: boolean) {
    setRecipeDialogOpen(open);
    if (!open) resetRecipeForm();
  }

  function openRecipeDialog(finishedGoodId?: number) {
    setRecipeError(null);
    setEditingRecipe(null);
    setRecipeFinishedGoodId(
      finishedGoodId != null
        ? String(finishedGoodId)
        : finishedGoodsOptions[0]?.id
          ? String(finishedGoodsOptions[0].id)
          : "",
    );
    setRecipeIngredientId("");
    setRecipeQuantity("1");
    setRecipeUnit("");
    setRecipeYieldFactor("1");
    setRecipeNote("");
    setRecipeDialogOpen(true);
  }

  useEffect(() => {
    if (!editingRecipe) return;
    setRecipeFinishedGoodId(String(editingRecipe.finished_good_id));
    setRecipeIngredientId(String(editingRecipe.ingredient_id));
    setRecipeQuantity(String(editingRecipe.quantity));
    setRecipeUnit(editingRecipe.unit);
    setRecipeYieldFactor(String(editingRecipe.yield_factor));
    setRecipeNote(editingRecipe.note ?? "");
    setRecipeDialogOpen(true);
  }, [editingRecipe]);

  function handleFinishedGoodCreated(good: FinishedGoodOption) {
    setFinishedGoodsOptions((prev) => {
      if (prev.some((item) => item.id === good.id)) {
        return prev;
      }
      return sortFinishedGoods([...prev, good]);
    });
    setRecipeFinishedGoodId(String(good.id));
    router.refresh();
  }

  function handleRawIngredientCreated(ingredient: RawIngredientOption) {
    setRawIngredientsOptions((prev) => {
      if (prev.some((item) => item.id === ingredient.id)) {
        return prev;
      }
      return sortRawIngredients([...prev, ingredient]);
    });
    setRecipeIngredientId(String(ingredient.id));
    setRecipeUnit(ingredient.unit);
    router.refresh();
  }

  function handleRecipeSubmit() {
    const parsedFinishedGoodId = Number(recipeFinishedGoodId);
    const parsedIngredientId = Number(recipeIngredientId);
    const parsedQuantity = Number(recipeQuantity);
    const parsedYieldFactor = Number(recipeYieldFactor);

    startTransition(async () => {
      setRecipeError(null);
      const result = await upsertProductionRecipe({
        finishedGoodId: parsedFinishedGoodId,
        ingredientId: parsedIngredientId,
        quantity: parsedQuantity,
        unit: recipeUnit.trim(),
        yieldFactor: parsedYieldFactor,
        note: recipeNote.trim() || undefined,
      });
      if (!result.success) {
        setRecipeError(result.error ?? "Không thể lưu công thức");
        return;
      }
      toast.success("Đã lưu công thức");
      setRecipeDialogOpen(false);
      resetRecipeForm();
      router.refresh();
    });
  }

  function handleRecipeDelete(recipeId: number) {
    startTransition(async () => {
      const result = await deleteProductionRecipe(recipeId);
      if (!result.success) {
        toast.error(result.error ?? "Không thể xóa công thức");
        return;
      }
      toast.success("Đã xóa công thức");
      router.refresh();
    });
  }

  function handleRecipeGroupDelete() {
    if (!recipeGroupToDelete) return;

    startTransition(async () => {
      const result = await deleteProductionRecipeGroup(
        recipeGroupToDelete.finishedGoodId,
      );
      if (!result.success) {
        toast.error(result.error ?? "Không thể xóa công thức cũ");
        return;
      }
      toast.success("Đã xóa toàn bộ công thức cũ của thành phẩm");
      setRecipeGroupToDelete(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Công thức sản xuất</h3>
          <p className="text-sm text-muted-foreground">
            Mỗi thành phẩm có thể gồm nhiều nguyên liệu. Mỗi lần lưu là một dòng
            nguyên liệu trong BOM của thành phẩm đó.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => openRecipeDialog()}
        >
          <Plus className="mr-2 size-4" />
          Thêm dòng BOM
        </Button>
      </div>

      <Dialog
        open={recipeDialogOpen}
        onOpenChange={handleRecipeDialogOpenChange}
      >
        <DialogContent className="max-h-screen overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingRecipe
                ? "Chỉnh sửa dòng nguyên liệu"
                : "Thêm dòng nguyên liệu"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Một thành phẩm có thể có nhiều dòng nguyên liệu. Mỗi dòng bên dưới
              tương ứng với một nguyên liệu trong BOM sản xuất.
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="recipeFinishedGood">Thành phẩm</Label>
                <Select
                  value={recipeFinishedGoodId}
                  onValueChange={setRecipeFinishedGoodId}
                  disabled={editingRecipe != null}
                >
                  <SelectTrigger id="recipeFinishedGood" className="w-full">
                    <SelectValue placeholder="Chọn thành phẩm" />
                  </SelectTrigger>
                  <SelectContent>
                    {finishedGoodsOptions.map((good) => (
                      <SelectItem key={good.id} value={String(good.id)}>
                        {good.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!editingRecipe && canManageCatalog && (
                  <p className="text-xs text-muted-foreground">
                    Chưa có trong danh sách?{" "}
                    <button
                      type="button"
                      onClick={() => setQuickFinishedGoodDialogOpen(true)}
                      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      <Plus className="size-3.5" />
                      Tạo thành phẩm mới
                    </button>
                  </p>
                )}
                {!editingRecipe &&
                  !canManageCatalog &&
                  finishedGoodsOptions.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Chưa có thành phẩm trong danh mục và bạn không có quyền tạo
                      mới tại đây.
                    </p>
                  )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="recipeIngredient">Nguyên liệu</Label>
                <Select
                  value={recipeIngredientId}
                  onValueChange={(value) => {
                    setRecipeIngredientId(value);
                    const ing = rawIngredientsOptions.find(
                      (item) => item.id === Number(value),
                    );
                    if (ing) setRecipeUnit(ing.unit);
                  }}
                  disabled={editingRecipe != null}
                >
                  <SelectTrigger id="recipeIngredient" className="w-full">
                    <SelectValue placeholder="Chọn nguyên liệu" />
                  </SelectTrigger>
                  <SelectContent>
                    {rawIngredientsOptions.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!editingRecipe && canManageCatalog && (
                  <p className="text-xs text-muted-foreground">
                    Thiếu nguyên liệu đầu vào?{" "}
                    <button
                      type="button"
                      onClick={() => setQuickRawIngredientDialogOpen(true)}
                      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      <Plus className="size-3.5" />
                      Tạo nguyên liệu mới
                    </button>
                  </p>
                )}
                {!editingRecipe &&
                  !canManageCatalog &&
                  rawIngredientsOptions.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Chưa có nguyên liệu đầu vào và bạn không có quyền tạo mới
                      tại đây.
                    </p>
                  )}
                {editingRecipe && (
                  <p className="text-xs text-muted-foreground">
                    Muốn đổi thành phẩm hoặc nguyên liệu, hãy xóa dòng cũ và tạo
                    dòng mới để tránh ghi đè sai BOM.
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="recipeQuantity">Số lượng</Label>
                <FormattedNumberInput
                  id="recipeQuantity"
                  value={recipeQuantity}
                  onValueChange={setRecipeQuantity}
                  maxFractionDigits={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recipeUnit">Đơn vị</Label>
                <Input
                  id="recipeUnit"
                  value={recipeUnit}
                  onChange={(e) => setRecipeUnit(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recipeYieldFactor">Yield</Label>
                <FormattedNumberInput
                  id="recipeYieldFactor"
                  value={recipeYieldFactor}
                  onValueChange={setRecipeYieldFactor}
                  maxFractionDigits={3}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="recipeNote">Ghi chú</Label>
              <Textarea
                id="recipeNote"
                value={recipeNote}
                onChange={(e) => setRecipeNote(e.target.value)}
                placeholder="Tỷ lệ ước tính, lưu ý hao hụt..."
              />
            </div>

            {recipeError && (
              <p className="text-sm text-destructive" role="alert">
                {recipeError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleRecipeDialogOpenChange(false)}
              disabled={isPending}
            >
              Hủy
            </Button>
            <Button
              type="button"
              onClick={handleRecipeSubmit}
              disabled={isPending || !canSubmitRecipe}
            >
              {isPending && <Spinner className="mr-2" />}
              Lưu dòng BOM
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <QuickFinishedGoodDialog
        open={quickFinishedGoodDialogOpen}
        onOpenChange={setQuickFinishedGoodDialogOpen}
        onCreated={handleFinishedGoodCreated}
      />
      <QuickRawIngredientDialog
        open={quickRawIngredientDialogOpen}
        onOpenChange={setQuickRawIngredientDialogOpen}
        onCreated={handleRawIngredientCreated}
      />
      <AlertDialog
        open={recipeGroupToDelete != null}
        onOpenChange={(open) => {
          if (!open) setRecipeGroupToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa toàn bộ BOM?</AlertDialogTitle>
            <AlertDialogDescription>
              {recipeGroupToDelete
                ? `Thao tác này sẽ xóa toàn bộ ${recipeGroupToDelete.lines.length} dòng BOM của "${recipeGroupToDelete.finishedGoodName}".`
                : "Thao tác này sẽ xóa toàn bộ BOM của thành phẩm đã chọn."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRecipeGroupDelete}
              disabled={isPending}
            >
              {isPending && <Spinner className="mr-2" />}
              Xóa toàn bộ BOM
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {groupedRecipes.length === 0 ? (
        <Card className="min-h-40 border border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
            <div className="space-y-1.5">
              <h3 className="text-2xl font-semibold">Chưa có BOM nào</h3>
              <p className="max-w-md text-sm leading-6 text-muted-foreground">
                Hãy thêm ít nhất một dòng nguyên liệu để bắt đầu cấu hình công
                thức cho thành phẩm.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groupedRecipes.map((group) => (
            <Card
              key={group.finishedGoodId}
              className="group/recipe overflow-hidden rounded-lg"
            >
              <CardContent className="px-4 py-5 sm:px-5">
                <div
                  className={cn(
                    "-m-4 flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3 transition-colors md:-m-5 md:px-5",
                    "group-hover/recipe:bg-muted/35 group-focus-within/recipe:bg-muted/35",
                  )}
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold">
                        {group.finishedGoodName}
                      </h4>
                      <Badge variant={badgeVariantFromTone("neutral")}>
                        {group.lines.length} nguyên liệu
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Mỗi dòng bên dưới là một nguyên liệu cấu thành thành phẩm
                      này.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openRecipeDialog(group.finishedGoodId)}
                    >
                      <Plus className="mr-2 size-4" />
                      Thêm nguyên liệu
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setRecipeGroupToDelete(group)}
                      className={cn(
                        "transition-opacity md:opacity-0 md:group-hover/recipe:opacity-100 md:group-focus-within/recipe:opacity-100",
                        "md:pointer-events-none md:group-hover/recipe:pointer-events-auto md:group-focus-within/recipe:pointer-events-auto",
                      )}
                    >
                      <Trash2 className="mr-2 size-4" />
                      Xóa toàn bộ BOM
                    </Button>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nguyên liệu</TableHead>
                      <TableHead>Số lượng</TableHead>
                      <TableHead>Yield</TableHead>
                      <TableHead>Ghi chú</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.lines.map((recipe) => (
                      <TableRow key={recipe.id}>
                        <TableCell>
                          <div className="font-medium">
                            {recipe.ingredient_name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {recipe.unit}
                          </div>
                        </TableCell>
                        <TableCell>
                          {recipe.quantity} {recipe.unit}
                        </TableCell>
                        <TableCell>{recipe.yield_factor}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {recipe.note ?? "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingRecipe(recipe)}
                              aria-label={`Chỉnh sửa dòng BOM ${recipe.ingredient_name}`}
                              title="Chỉnh sửa dòng BOM"
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRecipeDelete(recipe.id)}
                              aria-label={`Xóa dòng BOM ${recipe.ingredient_name}`}
                              title="Xóa dòng BOM"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
