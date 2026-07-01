"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: inventory production recipe panel keeps kitchen workflow copy inline */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import {
  ClipboardList as IconClipboardList,
  Pencil as IconPencil,
  Plus as IconPlus,
  Trash as IconTrash,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  Field,
  FieldError,
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
import { Combobox, FormDialog } from "@/components/form";
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
import type { ActionResult } from "@comtammatu/shared/types";

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
  entry_unit_id: z.string().optional(),
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
    entry_unit_id: "",
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
    entry_unit_id: recipe.entry_unit_id != null ? String(recipe.entry_unit_id) : "",
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

function RecipeDialogFields({
  form,
  canManageCatalog,
  finishedGoodLocked,
  finishedGoodOptions,
  finishedGoodsOptions,
  groupedRecipes,
  recipeLinesEditorIngredients,
  rawIngredientsOptions,
  onFinishedGoodCreated,
  onRawIngredientCreated,
}: {
  form: UseFormReturn<RecipeFormValues, unknown, RecipeFormValues>;
  canManageCatalog: boolean;
  finishedGoodLocked: boolean;
  finishedGoodOptions: { value: string; label: string }[];
  finishedGoodsOptions: FinishedGoodOption[];
  groupedRecipes: ProductionRecipeGroup[];
  recipeLinesEditorIngredients: RawIngredientOption[];
  rawIngredientsOptions: RawIngredientOption[];
  onFinishedGoodCreated: (good: FinishedGoodOption) => void;
  onRawIngredientCreated: (ingredient: RawIngredientOption) => void;
}) {
  const [quickFinishedGoodDialogOpen, setQuickFinishedGoodDialogOpen] =
    useState(false);
  const [quickRawIngredientDialogOpen, setQuickRawIngredientDialogOpen] =
    useState(false);
  const {
    fields: recipeLineFields,
    append: appendRecipeLine,
    replace: replaceRecipeLines,
  } = useFieldArray({
    control: form.control,
    name: "lines",
  });

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

  function handleFinishedGoodCreated(good: FinishedGoodOption) {
    onFinishedGoodCreated(good);
    form.setValue("finished_good_id", String(good.id));
    replaceRecipeLines([emptyRecipeLine()]);
  }

  function handleRawIngredientCreated(ingredient: RawIngredientOption) {
    onRawIngredientCreated(ingredient);
    const lines = form.getValues("lines");
    const targetIndex = lines.findIndex((line) => !line.ingredient_id);
    if (targetIndex < 0) {
      appendRecipeLine({
        ...emptyRecipeLine(),
        ingredient_id: String(ingredient.id),
        unit: ingredient.unit,
      });
    } else {
      form.setValue(`lines.${targetIndex}.ingredient_id`, String(ingredient.id));
      form.setValue(`lines.${targetIndex}.unit`, ingredient.unit);
    }
  }

  return (
    <>
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
    </>
  );
}

export function ProductionRecipePanel({
  canManageCatalog,
  canManageRecipes,
  finishedGoods,
  ingredients,
  recipes,
}: ProductionRecipePanelProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
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
          units: ingredient.units,
        })),
    ),
  );

  const [recipeDialogOpen, setRecipeDialogOpen] = useState(false);
  const [pendingFinishedGoodId, setPendingFinishedGoodId] = useState<
    string | undefined
  >(undefined);

  const defaultFinishedGoodId = finishedGoodsOptions[0]?.id
    ? String(finishedGoodsOptions[0].id)
    : "";
  const [formDefaults, setFormDefaults] = useState<RecipeFormValues>(() =>
    toRecipeFormValues(null, defaultFinishedGoodId),
  );

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
            units: ingredient.units,
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
        units: item.units,
      })),
    [rawIngredientsOptions],
  );

  const finishedGoodLocked = pendingFinishedGoodId != null;

  function openRecipeDialog(finishedGoodId?: number) {
    const group =
      finishedGoodId != null
        ? (groupedRecipes.find(
            (item) => item.finishedGoodId === finishedGoodId,
          ) ?? null)
        : null;
    const initialFinishedGoodId =
      finishedGoodId != null ? String(finishedGoodId) : defaultFinishedGoodId;
    setPendingFinishedGoodId(
      finishedGoodId != null ? String(finishedGoodId) : undefined,
    );
    setFormDefaults(toRecipeFormValues(group, initialFinishedGoodId));
    setRecipeDialogOpen(true);
  }

  function handleRecipeDialogOpenChange(open: boolean) {
    setRecipeDialogOpen(open);
    if (!open) {
      setPendingFinishedGoodId(undefined);
    }
  }

  function handleFinishedGoodCreated(good: FinishedGoodOption) {
    setFinishedGoodsOptions((prev) => {
      if (prev.some((item) => item.id === good.id)) {
        return prev;
      }
      return sortFinishedGoods([...prev, good]);
    });
    setPendingFinishedGoodId(String(good.id));
    router.refresh();
  }

  function handleRawIngredientCreated(ingredient: RawIngredientOption) {
    setRawIngredientsOptions((prev) => {
      if (prev.some((item) => item.id === ingredient.id)) {
        return prev;
      }
      return sortRawIngredients([...prev, ingredient]);
    });
    router.refresh();
  }

  async function submitRecipe(values: RecipeFormValues): Promise<ActionResult> {
    const result = await upsertProductionRecipeLines({
      finishedGoodId: Number(values.finished_good_id),
      lines: values.lines.map((line) => ({
        ingredientId: Number(line.ingredient_id),
        quantity: Number(line.quantity),
        unit: line.unit.trim(),
        entryUnitId: line.entry_unit_id ? Number(line.entry_unit_id) : null,
        yieldFactor: Number(line.yield_factor),
        note: line.note?.trim() || undefined,
      })),
    });

    if (!result.success && !result.error) {
      return { success: false, error: "Không thể lưu BOM sản xuất" };
    }
    return result;
  }

  function handleRecipeSaved(_result: ActionResult, values: RecipeFormValues) {
    toast.success(`Đã lưu ${values.lines.length} nguyên liệu trong BOM`);
    router.refresh();
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

      <FormDialog
        open={recipeDialogOpen}
        onOpenChange={handleRecipeDialogOpenChange}
        title={finishedGoodLocked ? "Cập nhật BOM" : "Nhập BOM sản xuất"}
        description="Chọn thành phẩm một lần, thêm nhiều nguyên liệu rồi lưu BOM."
        schema={recipeFormSchema}
        defaultValues={formDefaults}
        entityKey={formDefaults.finished_good_id || "new"}
        onSubmit={submitRecipe}
        onSuccess={handleRecipeSaved}
        submitLabel="Lưu BOM"
        cancelLabel={ACTIONS_VI.cancel}
        contentClassName="sm:max-w-5xl"
      >
        {(form) => (
          <RecipeDialogFields
            form={form}
            canManageCatalog={canManageCatalog}
            finishedGoodLocked={finishedGoodLocked}
            finishedGoodOptions={finishedGoodOptions}
            finishedGoodsOptions={finishedGoodsOptions}
            groupedRecipes={groupedRecipes}
            recipeLinesEditorIngredients={recipeLinesEditorIngredients}
            rawIngredientsOptions={rawIngredientsOptions}
            onFinishedGoodCreated={handleFinishedGoodCreated}
            onRawIngredientCreated={handleRawIngredientCreated}
          />
        )}
      </FormDialog>

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
