"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
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
import { FieldGroup } from "@comtammatu/ui/components/field";
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
import {
  ComboboxField,
  NumberField,
  TextField,
  TextareaField,
} from "@/components/form";
import {
  deleteProductionRecipeGroup,
  deleteProductionRecipe,
  upsertProductionRecipe,
} from "./production-actions";
import {
  QuickFinishedGoodDialog,
  QuickRawIngredientDialog,
} from "./production-quick-create-dialogs";
import { ProductionRecipeImportExportMenu } from "./production-recipe-import-export-menu";
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

/* ─── Schema ─── */

const recipeLineSchema = z.object({
  finished_good_id: z
    .string()
    .min(1, { error: "Vui lòng chọn thành phẩm" })
    .refine((v) => Number(v) > 0, { error: "Thành phẩm không hợp lệ" }),
  ingredient_id: z
    .string()
    .min(1, { error: "Vui lòng chọn nguyên liệu" })
    .refine((v) => Number(v) > 0, { error: "Nguyên liệu không hợp lệ" }),
  quantity: z
    .string()
    .min(1, { error: "Nhập số lượng" })
    .refine((v) => Number(v) > 0, { error: "Số lượng phải > 0" }),
  unit: z.string().trim().min(1, { error: "Đơn vị không được trống" }),
  yield_factor: z
    .string()
    .min(1, { error: "Nhập yield" })
    .refine((v) => Number(v) > 0, { error: "Yield phải > 0" }),
  note: z.string().optional(),
});

type RecipeLineFormValues = z.infer<typeof recipeLineSchema>;

function toFormValues(
  recipe: ProductionRecipeRow | null,
  defaultFinishedGoodId?: string,
): RecipeLineFormValues {
  if (recipe) {
    return {
      finished_good_id: String(recipe.finished_good_id),
      ingredient_id: String(recipe.ingredient_id),
      quantity: String(recipe.quantity),
      unit: recipe.unit,
      yield_factor: String(recipe.yield_factor),
      note: recipe.note ?? "",
    };
  }
  return {
    finished_good_id: defaultFinishedGoodId ?? "",
    ingredient_id: "",
    quantity: "1",
    unit: "",
    yield_factor: "1",
    note: "",
  };
}

/* ─── Main recipe panel ─── */

interface ProductionRecipePanelProps {
  canManageCatalog: boolean;
  canManageRecipes: boolean;
  finishedGoods: FinishedGoodOption[];
  ingredients: IngredientOption[];
  recipes: ProductionRecipeRow[];
}

export function ProductionRecipePanel({
  canManageCatalog,
  canManageRecipes,
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
  const [serverError, setServerError] = useState<string | null>(null);
  const [editingRecipe, setEditingRecipe] =
    useState<ProductionRecipeRow | null>(null);
  const [recipeGroupToDelete, setRecipeGroupToDelete] =
    useState<ProductionRecipeGroup | null>(null);
  const [pendingFinishedGoodId, setPendingFinishedGoodId] = useState<
    string | undefined
  >(undefined);

  const defaultFinishedGoodId = finishedGoodsOptions[0]?.id
    ? String(finishedGoodsOptions[0].id)
    : "";

  const form = useForm<RecipeLineFormValues, unknown, RecipeLineFormValues>({
    resolver: zodResolver(recipeLineSchema),
    defaultValues: toFormValues(null, defaultFinishedGoodId),
  });

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

  useEffect(() => {
    if (recipeDialogOpen) {
      form.reset(
        toFormValues(
          editingRecipe,
          pendingFinishedGoodId ?? defaultFinishedGoodId,
        ),
      );
      setServerError(null);
    }
  }, [
    recipeDialogOpen,
    editingRecipe,
    pendingFinishedGoodId,
    defaultFinishedGoodId,
    form,
  ]);

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

  const finishedGoodOptions = finishedGoodsOptions.map((good) => ({
    value: String(good.id),
    label: good.name,
  }));

  const ingredientOptions = rawIngredientsOptions.map((item) => ({
    value: String(item.id),
    label: item.name,
  }));

  function openRecipeDialog(finishedGoodId?: number) {
    setEditingRecipe(null);
    setPendingFinishedGoodId(
      finishedGoodId != null ? String(finishedGoodId) : undefined,
    );
    setRecipeDialogOpen(true);
  }

  function handleRecipeDialogOpenChange(open: boolean) {
    setRecipeDialogOpen(open);
    if (!open) {
      setEditingRecipe(null);
      setPendingFinishedGoodId(undefined);
      setServerError(null);
    }
  }

  function handleFinishedGoodCreated(good: FinishedGoodOption) {
    setFinishedGoodsOptions((prev) => {
      if (prev.some((item) => item.id === good.id)) {
        return prev;
      }
      return sortFinishedGoods([...prev, good]);
    });
    form.setValue("finished_good_id", String(good.id));
    router.refresh();
  }

  function handleRawIngredientCreated(ingredient: RawIngredientOption) {
    setRawIngredientsOptions((prev) => {
      if (prev.some((item) => item.id === ingredient.id)) {
        return prev;
      }
      return sortRawIngredients([...prev, ingredient]);
    });
    form.setValue("ingredient_id", String(ingredient.id));
    form.setValue("unit", ingredient.unit);
    router.refresh();
  }

  const ingredientValue = form.watch("ingredient_id");
  useEffect(() => {
    if (!ingredientValue || editingRecipe) return;
    const ing = rawIngredientsOptions.find(
      (item) => item.id === Number(ingredientValue),
    );
    if (ing && !form.getValues("unit")) {
      form.setValue("unit", ing.unit);
    }
  }, [ingredientValue, editingRecipe, rawIngredientsOptions, form]);

  function onValid(values: RecipeLineFormValues) {
    startTransition(async () => {
      setServerError(null);
      const result = await upsertProductionRecipe({
        finishedGoodId: Number(values.finished_good_id),
        ingredientId: Number(values.ingredient_id),
        quantity: Number(values.quantity),
        unit: values.unit.trim(),
        yieldFactor: Number(values.yield_factor),
        note: values.note?.trim() || undefined,
      });
      if (!result.success) {
        setServerError(result.error ?? "Không thể lưu công thức");
        return;
      }
      toast.success("Đã lưu công thức");
      setRecipeDialogOpen(false);
      setEditingRecipe(null);
      setPendingFinishedGoodId(undefined);
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

  // Open the dialog via edit click: set editingRecipe, then the effect reacts.
  function handleEditClick(recipe: ProductionRecipeRow) {
    setEditingRecipe(recipe);
    setPendingFinishedGoodId(undefined);
    setRecipeDialogOpen(true);
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
        {canManageRecipes ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ProductionRecipeImportExportMenu
              onImported={() => router.refresh()}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => openRecipeDialog()}
            >
              <IconPlus className="mr-2 size-4" />
              Thêm dòng BOM
            </Button>
          </div>
        ) : null}
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

          <form onSubmit={form.handleSubmit(onValid)} noValidate>
            <FieldGroup>
              <p className="text-sm text-muted-foreground">
                Một thành phẩm có thể có nhiều dòng nguyên liệu. Mỗi dòng bên
                dưới tương ứng với một nguyên liệu trong BOM sản xuất.
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <ComboboxField
                    control={form.control}
                    name="finished_good_id"
                    label="Thành phẩm"
                    options={finishedGoodOptions}
                    placeholder="Chọn thành phẩm"
                    searchPlaceholder="Tìm thành phẩm..."
                    disabled={editingRecipe != null}
                    required
                  />
                  {!editingRecipe && canManageCatalog && (
                    <p className="text-xs text-muted-foreground">
                      Chưa có trong danh sách?{" "}
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 font-medium"
                        onClick={() => setQuickFinishedGoodDialogOpen(true)}
                      >
                        <IconPlus className="size-3.5" />
                        Tạo thành phẩm mới
                      </Button>
                    </p>
                  )}
                  {!editingRecipe &&
                    !canManageCatalog &&
                    finishedGoodsOptions.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Chưa có thành phẩm trong danh mục và bạn không có quyền
                        tạo mới tại đây.
                      </p>
                    )}
                </div>
                <div className="space-y-2">
                  <ComboboxField
                    control={form.control}
                    name="ingredient_id"
                    label="Nguyên liệu"
                    options={ingredientOptions}
                    placeholder="Chọn nguyên liệu"
                    searchPlaceholder="Tìm nguyên liệu..."
                    disabled={editingRecipe != null}
                    required
                  />
                  {!editingRecipe && canManageCatalog && (
                    <p className="text-xs text-muted-foreground">
                      Thiếu nguyên liệu đầu vào?{" "}
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 font-medium"
                        onClick={() => setQuickRawIngredientDialogOpen(true)}
                      >
                        <IconPlus className="size-3.5" />
                        Tạo nguyên liệu mới
                      </Button>
                    </p>
                  )}
                  {!editingRecipe &&
                    !canManageCatalog &&
                    rawIngredientsOptions.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Chưa có nguyên liệu đầu vào và bạn không có quyền tạo
                        mới tại đây.
                      </p>
                    )}
                  {editingRecipe && (
                    <p className="text-xs text-muted-foreground">
                      Muốn đổi thành phẩm hoặc nguyên liệu, hãy xóa dòng cũ và
                      tạo dòng mới để tránh ghi đè sai BOM.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <NumberField
                  control={form.control}
                  name="quantity"
                  label="Số lượng"
                  maxFractionDigits={3}
                  required
                />
                <TextField
                  control={form.control}
                  name="unit"
                  label="Đơn vị"
                  required
                />
                <NumberField
                  control={form.control}
                  name="yield_factor"
                  label="Yield"
                  maxFractionDigits={3}
                  required
                />
              </div>

              <TextareaField
                control={form.control}
                name="note"
                label="Ghi chú"
                placeholder="Tỷ lệ ước tính, lưu ý hao hụt..."
              />

              {serverError && (
                <p className="text-sm text-destructive" role="alert">
                  {serverError}
                </p>
              )}
            </FieldGroup>

            <DialogFooter className="pt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleRecipeDialogOpenChange(false)}
                disabled={isPending}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Spinner className="mr-2" />}
                Lưu dòng BOM
              </Button>
            </DialogFooter>
          </form>
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
                  {canManageRecipes ? (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openRecipeDialog(group.finishedGoodId)}
                      >
                        <IconPlus className="mr-2 size-4" />
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
                        <IconTrash className="mr-2 size-4" />
                        Xóa toàn bộ BOM
                      </Button>
                    </div>
                  ) : null}
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nguyên liệu</TableHead>
                      <TableHead>Số lượng</TableHead>
                      <TableHead>Yield</TableHead>
                      <TableHead>Ghi chú</TableHead>
                      {canManageRecipes ? <TableHead className="w-24" /> : null}
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
                        {canManageRecipes ? (
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditClick(recipe)}
                                aria-label={`Chỉnh sửa dòng BOM ${recipe.ingredient_name}`}
                                title="Chỉnh sửa dòng BOM"
                              >
                                <IconPencil className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRecipeDelete(recipe.id)}
                                aria-label={`Xóa dòng BOM ${recipe.ingredient_name}`}
                                title="Xóa dòng BOM"
                              >
                                <IconTrash className="size-4" />
                              </Button>
                            </div>
                          </TableCell>
                        ) : null}
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
