"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: inventory production recipe panel keeps kitchen workflow copy inline */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ClipboardList as IconClipboardList,
  Pencil as IconPencil,
  Plus as IconPlus,
  Trash as IconTrash,
} from "lucide-react";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { Combobox } from "@/components/form";
import { AppEmptyState, AppSection } from "@/components/surface";
import { RecipeLinesEditor } from "./_components/recipe-lines-editor";
import {
  deleteProductionRecipeGroup,
  deleteProductionRecipe,
  upsertProductionRecipeLines,
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

import { ACTIONS_VI, FORM_VI, PRODUCT_VI } from "@comtammatu/shared/messages";
const recipeLineItemSchema = z.object({
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

const recipeFormSchema = z
  .object({
    finished_good_id: z
      .string()
      .min(1, { error: "Vui lòng chọn thành phẩm" })
      .refine((v) => Number(v) > 0, { error: "Thành phẩm không hợp lệ" }),
    lines: z.array(recipeLineItemSchema).min(1, {
      error: "Cần ít nhất một nguyên liệu trong BOM.",
    }),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.lines.forEach((line, index) => {
      if (!line.ingredient_id) return;
      if (seen.has(line.ingredient_id)) {
        ctx.addIssue({
          code: "custom",
          path: ["lines", index, "ingredient_id"],
          message: "Nguyên liệu bị trùng trong BOM.",
        });
      }
      seen.add(line.ingredient_id);
    });
  });

type RecipeLineItemFormValues = z.infer<typeof recipeLineItemSchema>;
type RecipeFormValues = z.infer<typeof recipeFormSchema>;

function emptyRecipeLine(): RecipeLineItemFormValues {
  return {
    ingredient_id: "",
    quantity: "1",
    unit: "",
    yield_factor: "1",
    note: "",
  };
}

function recipeToLineFormValue(
  recipe: ProductionRecipeRow,
): RecipeLineItemFormValues {
  return {
    ingredient_id: String(recipe.ingredient_id),
    quantity: String(recipe.quantity),
    unit: recipe.unit,
    yield_factor: String(recipe.yield_factor),
    note: recipe.note ?? "",
  };
}

function toRecipeFormValues(
  group: ProductionRecipeGroup | null,
  defaultFinishedGoodId?: string,
): RecipeFormValues {
  if (group) {
    return {
      finished_good_id: String(group.finishedGoodId),
      lines:
        group.lines.length > 0
          ? group.lines.map(recipeToLineFormValue)
          : [emptyRecipeLine()],
    };
  }

  return {
    finished_good_id: defaultFinishedGoodId ?? "",
    lines: [emptyRecipeLine()],
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
  const [editingRecipeGroup, setEditingRecipeGroup] =
    useState<ProductionRecipeGroup | null>(null);
  const [pendingFinishedGoodId, setPendingFinishedGoodId] = useState<
    string | undefined
  >(undefined);

  const defaultFinishedGoodId = finishedGoodsOptions[0]?.id
    ? String(finishedGoodsOptions[0].id)
    : "";

  const form = useForm<RecipeFormValues, unknown, RecipeFormValues>({
    resolver: zodResolver(recipeFormSchema),
    defaultValues: toRecipeFormValues(null, defaultFinishedGoodId),
  });
  const {
    fields: recipeLineFields,
    append: appendRecipeLine,
    replace: replaceRecipeLines,
  } = useFieldArray({
    control: form.control,
    name: "lines",
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

  const recipeLinesEditorIngredients = useMemo(
    () =>
      rawIngredientsOptions.map((item) => ({
        id: item.id,
        name: item.name,
        unit: item.unit,
      })),
    [rawIngredientsOptions],
  );

  const finishedGoodLocked = pendingFinishedGoodId != null;

  useEffect(() => {
    if (!recipeDialogOpen) return;

    const initialFinishedGoodId =
      pendingFinishedGoodId ??
      (editingRecipeGroup
        ? String(editingRecipeGroup.finishedGoodId)
        : defaultFinishedGoodId);
    const initialGroup =
      editingRecipeGroup ??
      groupedRecipes.find(
        (group) => group.finishedGoodId === Number(initialFinishedGoodId),
      ) ??
      null;

    form.reset(toRecipeFormValues(initialGroup, initialFinishedGoodId));
    setServerError(null);
  }, [
    recipeDialogOpen,
    editingRecipeGroup,
    pendingFinishedGoodId,
    defaultFinishedGoodId,
    groupedRecipes,
    form,
  ]);

  function replaceRecipeLinesForFinishedGood(finishedGoodId: string) {
    const group =
      groupedRecipes.find(
        (item) => item.finishedGoodId === Number(finishedGoodId),
      ) ?? null;
    replaceRecipeLines(
      group?.lines.length
        ? group.lines.map(recipeToLineFormValue)
        : [emptyRecipeLine()],
    );
  }

  function openRecipeDialog(finishedGoodId?: number) {
    const group =
      finishedGoodId != null
        ? (groupedRecipes.find(
            (item) => item.finishedGoodId === finishedGoodId,
          ) ?? null)
        : null;
    setEditingRecipeGroup(group);
    setPendingFinishedGoodId(
      finishedGoodId != null ? String(finishedGoodId) : undefined,
    );
    setRecipeDialogOpen(true);
  }

  function handleRecipeDialogOpenChange(open: boolean) {
    setRecipeDialogOpen(open);
    if (!open) {
      setEditingRecipeGroup(null);
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
    setPendingFinishedGoodId(String(good.id));
    replaceRecipeLines([emptyRecipeLine()]);
    router.refresh();
  }

  function handleRawIngredientCreated(ingredient: RawIngredientOption) {
    setRawIngredientsOptions((prev) => {
      if (prev.some((item) => item.id === ingredient.id)) {
        return prev;
      }
      return sortRawIngredients([...prev, ingredient]);
    });
    const lines = form.getValues("lines");
    const targetIndex = lines.findIndex((line) => !line.ingredient_id);
    if (targetIndex < 0) {
      appendRecipeLine({
        ...emptyRecipeLine(),
        ingredient_id: String(ingredient.id),
        unit: ingredient.unit,
      });
    } else {
      form.setValue(
        `lines.${targetIndex}.ingredient_id`,
        String(ingredient.id),
      );
      form.setValue(`lines.${targetIndex}.unit`, ingredient.unit);
    }
    router.refresh();
  }

  function onValid(values: RecipeFormValues) {
    startTransition(async () => {
      setServerError(null);
      const result = await upsertProductionRecipeLines({
        finishedGoodId: Number(values.finished_good_id),
        lines: values.lines.map((line) => ({
          ingredientId: Number(line.ingredient_id),
          quantity: Number(line.quantity),
          unit: line.unit.trim(),
          yieldFactor: Number(line.yield_factor),
          note: line.note?.trim() || undefined,
        })),
      });
      if (!result.success) {
        setServerError(result.error ?? "Không thể lưu BOM sản xuất");
        return;
      }
      toast.success(`Đã lưu ${values.lines.length} nguyên liệu trong BOM`);
      setRecipeDialogOpen(false);
      setEditingRecipeGroup(null);
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

  async function handleRecipeGroupDelete(group: ProductionRecipeGroup) {
    const ok = await confirm({
      title: "Xóa toàn bộ BOM?",
      description: `Thao tác này sẽ xóa toàn bộ ${group.lines.length} dòng BOM của "${group.finishedGoodName}".`,
      confirmText: "Xóa toàn bộ BOM",
      cancelText: ACTIONS_VI.cancel,
      variant: "destructive",
    });

    if (!ok) return;

    startTransition(async () => {
      const result = await deleteProductionRecipeGroup(group.finishedGoodId);
      if (!result.success) {
        toast.error(result.error ?? "Không thể xóa công thức cũ");
        return;
      }
      toast.success("Đã xóa toàn bộ công thức cũ của thành phẩm");
      router.refresh();
    });
  }

  function handleEditClick(recipe: ProductionRecipeRow) {
    openRecipeDialog(recipe.finished_good_id);
  }

  const recipeLineColumns: DataTableColumn<ProductionRecipeRow>[] = [
    {
      key: "ingredient",
      header: PRODUCT_VI.rawIngredient,
      render: (recipe) => (
        <div>
          <div className="font-medium">{recipe.ingredient_name}</div>
          <div className="text-xs text-muted-foreground">{recipe.unit}</div>
        </div>
      ),
    },
    {
      key: "quantity",
      header: FORM_VI.quantity,
      render: (recipe) => (
        <span>
          {recipe.quantity} {recipe.unit}
        </span>
      ),
    },
    {
      key: "yield",
      header: "Yield",
      render: (recipe) => recipe.yield_factor,
    },
    {
      key: "note",
      header: FORM_VI.notes,
      className: "text-muted-foreground",
      render: (recipe) => recipe.note ?? "—",
    },
    ...(canManageRecipes
      ? [
          {
            key: "actions",
            header: "",
            className: "w-24",
            render: (recipe) => (
              <div className="flex items-center justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEditClick(recipe)}
                  aria-label={`Cập nhật BOM ${recipe.finished_good_name}`}
                  title="Cập nhật BOM"
                >
                  <IconPencil />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRecipeDelete(recipe.id)}
                  aria-label={`Xóa dòng BOM ${recipe.ingredient_name}`}
                  title="Xóa dòng BOM"
                >
                  <IconTrash />
                </Button>
              </div>
            ),
          } satisfies DataTableColumn<ProductionRecipeRow>,
        ]
      : []),
  ];

  return (
    <section className="flex flex-col gap-3">
      <AppSection
        title="Công thức sản xuất"
        icon={<IconClipboardList />}
        action={
          canManageRecipes ? (
            <>
              <ProductionRecipeImportExportMenu
                onImported={() => router.refresh()}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => openRecipeDialog()}
              >
                <IconPlus data-icon="inline-start" />
                Nhập BOM
              </Button>
            </>
          ) : null
        }
      >
        <div className="flex flex-wrap gap-2">
          <Badge variant={badgeVariantFromTone("neutral")}>
            {groupedRecipes.length} thành phẩm có BOM
          </Badge>
          <Badge variant={badgeVariantFromTone("neutral")}>
            {recipes.length} dòng nguyên liệu
          </Badge>
        </div>
      </AppSection>

      <Dialog
        open={recipeDialogOpen}
        onOpenChange={handleRecipeDialogOpenChange}
      >
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {finishedGoodLocked ? "Cập nhật BOM" : "Nhập BOM sản xuất"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onValid)} noValidate>
            <FieldGroup>
              <p className="text-sm text-muted-foreground">
                Chọn thành phẩm một lần, thêm nhiều nguyên liệu rồi lưu BOM.
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Controller
                    control={form.control}
                    name="finished_good_id"
                    render={({ field, fieldState }) => (
                      <Field data-invalid={!!fieldState.error}>
                        <FieldLabel htmlFor="recipe-finished-good">
                          Thành phẩm *
                        </FieldLabel>
                        <Combobox
                          id="recipe-finished-good"
                          value={field.value ?? ""}
                          options={finishedGoodOptions}
                          placeholder="Chọn thành phẩm"
                          searchPlaceholder="Tìm thành phẩm..."
                          disabled={finishedGoodLocked}
                          aria-invalid={!!fieldState.error}
                          onValueChange={(nextValue) => {
                            field.onChange(nextValue);
                            replaceRecipeLinesForFinishedGood(nextValue);
                          }}
                        />
                        {fieldState.error ? (
                          <FieldError errors={[fieldState.error]} />
                        ) : null}
                      </Field>
                    )}
                  />
                  {!finishedGoodLocked && canManageCatalog ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto justify-start p-0 font-medium"
                      onClick={() => setQuickFinishedGoodDialogOpen(true)}
                    >
                      <IconPlus data-icon="inline-start" />
                      Tạo thành phẩm mới
                    </Button>
                  ) : null}
                  {!finishedGoodLocked &&
                  !canManageCatalog &&
                  finishedGoodsOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Chưa có thành phẩm trong danh mục.
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium">Dòng BOM</span>
                      <span className="text-xs text-muted-foreground">
                        {recipeLineFields.length} nguyên liệu
                      </span>
                    </div>
                    {canManageCatalog ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setQuickRawIngredientDialogOpen(true)}
                      >
                        <IconPlus data-icon="inline-start" />
                        Tạo nguyên liệu
                      </Button>
                    ) : null}
                  </div>
                  {!canManageCatalog && rawIngredientsOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Chưa có nguyên liệu đầu vào trong danh mục.
                    </p>
                  ) : null}
                </div>
              </div>

              <RecipeLinesEditor
                control={form.control}
                setValue={form.setValue}
                getValues={form.getValues}
                errors={form.formState.errors}
                ingredients={recipeLinesEditorIngredients}
                unitEditable
              />

              {serverError && (
                <p className="text-sm text-destructive" role="alert">
                  {serverError}
                </p>
              )}
            </FieldGroup>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleRecipeDialogOpenChange(false)}
                disabled={isPending}
              >
                {ACTIONS_VI.cancel}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Spinner data-icon="inline-start" />}
                Lưu BOM
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

      {groupedRecipes.length === 0 ? (
        <AppEmptyState
          mode="no-data"
          title="Chưa có BOM nào"
          description="Hãy thêm ít nhất một dòng nguyên liệu để bắt đầu cấu hình công thức cho thành phẩm."
          icon={<IconClipboardList className="size-5" />}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {groupedRecipes.map((group) => (
            <AppSection
              key={group.finishedGoodId}
              title={group.finishedGoodName}
              badge={{
                children: `${group.lines.length} nguyên liệu`,
                variant: badgeVariantFromTone("neutral"),
              }}
              action={
                canManageRecipes ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openRecipeDialog(group.finishedGoodId)}
                    >
                      <IconPencil data-icon="inline-start" />
                      Cập nhật BOM
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRecipeGroupDelete(group)}
                    >
                      <IconTrash data-icon="inline-start" />
                      Xóa toàn bộ BOM
                    </Button>
                  </>
                ) : null
              }
              contentFlush
            >
              <DataTable
                columns={recipeLineColumns}
                data={group.lines}
                getRowKey={(recipe) => recipe.id}
                mobileCardRender={(recipe) => (
                  <RecipeLineItemCard
                    recipe={recipe}
                    canManageRecipes={canManageRecipes}
                    onEdit={handleEditClick}
                    onDelete={handleRecipeDelete}
                  />
                )}
              />
            </AppSection>
          ))}
        </div>
      )}
    </section>
  );
}

function RecipeLineItemCard({
  recipe,
  canManageRecipes,
  onEdit,
  onDelete,
}: {
  recipe: ProductionRecipeRow;
  canManageRecipes: boolean;
  onEdit: (recipe: ProductionRecipeRow) => void;
  onDelete: (recipeId: number) => void;
}) {
  return (
    <Item variant="outline">
      <ItemHeader>
        <ItemTitle>{recipe.ingredient_name}</ItemTitle>
        <Badge variant={badgeVariantFromTone("neutral")}>
          {recipe.quantity} {recipe.unit}
        </Badge>
      </ItemHeader>
      <ItemContent>
        <ItemDescription>
          Yield {recipe.yield_factor} · {recipe.note ?? "Không ghi chú"}
        </ItemDescription>
      </ItemContent>
      {canManageRecipes ? (
        <ItemFooter>
          <ItemActions>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onEdit(recipe)}
            >
              <IconPencil data-icon="inline-start" />
              Cập nhật
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onDelete(recipe.id)}
            >
              <IconTrash data-icon="inline-start" />
              Xóa
            </Button>
          </ItemActions>
        </ItemFooter>
      ) : null}
    </Item>
  );
}
