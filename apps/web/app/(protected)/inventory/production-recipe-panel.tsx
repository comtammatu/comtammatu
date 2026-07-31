"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import {
  ArrowLeft as IconArrowLeft,
  ClipboardList as IconClipboardList,
  Pencil as IconPencil,
  Plus as IconPlus,
  Trash as IconTrash,
} from "lucide-react";
import { formatQuantity } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import { messages } from "@lib/messages";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { ComboboxField, FormDialog, NumberField } from "@/components/form";
import { AppEmptyState, AppSection } from "@/components/surface";
import {
  IngredientLinesEditor,
  type IngredientLineOption,
} from "./_components/ingredient-lines-editor";
import { getDefaultProductionUnit } from "./_lib/production-units";
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
import { OperatorFlowSteps } from "./_components/operator-flow-steps";
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
import type { UnitOption } from "@lib/inventory/types";
import type { ActionResult } from "@comtammatu/shared/types";

/* ─── Schema ─── */

import {
  ACTIONS_VI,
  FORM_VI,
  INVENTORY_VI,
  PRODUCT_VI,
} from "@comtammatu/shared/messages";
const recipeLineItemSchema = z.object({
  ingredient_id: z
    .string()
    .min(1, { error: INVENTORY_VI.productionRecipeSelectIngredientRequired })
    .refine((v) => Number(v) > 0, {
      error: INVENTORY_VI.productionRecipeIngredientInvalid,
    }),
  quantity: z
    .string()
    .min(1, { error: INVENTORY_VI.enterQuantity })
    .refine((v) => Number(v) > 0, { error: INVENTORY_VI.quantityPositive }),
  unitLabel: z.string().optional(),
  entry_unit_id: z
    .string()
    .min(1, { error: INVENTORY_VI.productionRecipeProductionUnitRequired })
    .refine((v) => Number(v) > 0, {
      error: INVENTORY_VI.productionRecipeProductionUnitRequired,
    }),
  yield_factor: z.string().optional(),
  note: z.string().optional(),
});

const recipeFormSchema = z
  .object({
    finished_good_id: z
      .string()
      .min(1, {
        error: INVENTORY_VI.productionRecipeSelectFinishedGoodRequired,
      })
      .refine((v) => Number(v) > 0, {
        error: INVENTORY_VI.productionRecipeFinishedGoodInvalid,
      }),
    output_quantity: z
      .string()
      .min(1, { error: INVENTORY_VI.enterProductionRecipeOutputQuantity })
      .refine((v) => Number(v) > 0, {
        error: INVENTORY_VI.productionRecipeOutputQuantityPositive,
      }),
    lines: z.array(recipeLineItemSchema).min(1, {
      error: INVENTORY_VI.productionRecipeMinLines,
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
          message: INVENTORY_VI.productionRecipeDuplicateIngredient,
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
    unitLabel: "",
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
    unitLabel: recipe.unitLabel,
    entry_unit_id:
      recipe.entry_unit_id != null ? String(recipe.entry_unit_id) : "",
    yield_factor: "1",
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
      output_quantity: String(group.lines[0]?.output_quantity ?? ""),
      lines:
        group.lines.length > 0
          ? group.lines.map(recipeToLineFormValue)
          : [emptyRecipeLine()],
    };
  }

  return {
    finished_good_id: defaultFinishedGoodId ?? "",
    output_quantity: "",
    lines: [emptyRecipeLine()],
  };
}

/* ─── Main recipe panel ─── */

interface ProductionRecipePanelProps {
  canManageCatalog: boolean;
  canManageRecipes: boolean;
  finishedGoods: FinishedGoodOption[];
  unitOptions: UnitOption[];
  ingredients: IngredientOption[];
  recipes: ProductionRecipeRow[];
  backHref?: string;
  embedded?: boolean;
}

function RecipeDialogFields({
  form,
  canManageCatalog,
  finishedGoodLocked,
  finishedGoodsOptions,
  unitOptions,
  groupedRecipes,
  recipeLinesEditorIngredients,
  rawIngredientsOptions,
  onFinishedGoodCreated,
  onRawIngredientCreated,
  pendingFinishedGoodId,
}: {
  form: UseFormReturn<RecipeFormValues, unknown, RecipeFormValues>;
  canManageCatalog: boolean;
  finishedGoodLocked: boolean;
  finishedGoodsOptions: FinishedGoodOption[];
  unitOptions: UnitOption[];
  groupedRecipes: ProductionRecipeGroup[];
  recipeLinesEditorIngredients: IngredientLineOption[];
  rawIngredientsOptions: RawIngredientOption[];
  onFinishedGoodCreated: (good: FinishedGoodOption) => void;
  onRawIngredientCreated: (ingredient: RawIngredientOption) => void;
  pendingFinishedGoodId?: string;
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

  function handleFinishedGoodCreated(good: FinishedGoodOption) {
    onFinishedGoodCreated(good);
    form.setValue("finished_good_id", String(good.id));
    replaceRecipeLines([emptyRecipeLine()]);
  }

  function handleRawIngredientCreated(ingredient: RawIngredientOption) {
    onRawIngredientCreated(ingredient);
    const defaultUnit = getDefaultProductionUnit(ingredient);
    const lines = form.getValues("lines");
    const targetIndex = lines.findIndex((line) => !line.ingredient_id);
    const nextLine = {
      ...emptyRecipeLine(),
      ingredient_id: String(ingredient.id),
      unitLabel: defaultUnit?.label ?? "",
      entry_unit_id: defaultUnit ? String(defaultUnit.unitId) : "",
    };
    if (targetIndex < 0) {
      appendRecipeLine(nextLine);
    } else {
      form.setValue(`lines.${targetIndex}.ingredient_id`, nextLine.ingredient_id);
      form.setValue(`lines.${targetIndex}.unitLabel`, nextLine.unitLabel);
      form.setValue(`lines.${targetIndex}.entry_unit_id`, nextLine.entry_unit_id);
    }
  }

  const availableFinishedGoodOptions = useMemo(() => {
    const blocked = new Set(groupedRecipes.map((r) => r.finishedGoodId));
    if (pendingFinishedGoodId != null) {
      blocked.delete(Number(pendingFinishedGoodId));
    }
    return finishedGoodsOptions
      .filter((good) => !blocked.has(good.id))
      .map((good) => ({
        value: String(good.id),
        label: good.name,
      }));
  }, [finishedGoodsOptions, groupedRecipes, pendingFinishedGoodId]);

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {INVENTORY_VI.productionRecipeDialogIntro}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <ComboboxField
            control={form.control}
            name="finished_good_id"
            id="recipe-finished-good"
            label={INVENTORY_VI.productionRecipeFinishedGoodLabel}
            options={availableFinishedGoodOptions}
            placeholder={INVENTORY_VI.selectFinishedGood}
            searchPlaceholder={INVENTORY_VI.searchFinishedGood}
            required
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
              {INVENTORY_VI.createFinishedGoodNew}
            </Button>
          ) : null}
          {!finishedGoodLocked &&
          !canManageCatalog &&
          finishedGoodsOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {INVENTORY_VI.noFinishedGoodInCatalog}
            </p>
          ) : null}
        </div>
        <NumberField
          control={form.control}
          name="output_quantity"
          id="recipe-output-quantity"
          label={INVENTORY_VI.productionRecipeOutputQuantityLabel}
          description={INVENTORY_VI.productionRecipeOutputQuantityHint}
          maxFractionDigits={3}
          required
        />
        <div className="flex flex-col gap-2 md:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                {INVENTORY_VI.productionRecipeLinesLabel}
              </span>
              <span className="text-xs text-muted-foreground">
                {INVENTORY_VI.ingredientCountBadge(recipeLineFields.length)}
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
                {INVENTORY_VI.createRawIngredient}
              </Button>
            ) : null}
          </div>
          {!canManageCatalog && rawIngredientsOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {INVENTORY_VI.noRawIngredientInCatalog}
            </p>
          ) : null}
        </div>
      </div>

      <IngredientLinesEditor
        control={form.control}
        setValue={form.setValue}
        getValues={form.getValues}
        errors={form.formState.errors}
        ingredients={recipeLinesEditorIngredients}
        unitEditable
        showYield={false}
      />

      <QuickFinishedGoodDialog
        open={quickFinishedGoodDialogOpen}
        onOpenChange={setQuickFinishedGoodDialogOpen}
        unitOptions={unitOptions}
        onCreated={handleFinishedGoodCreated}
      />
      <QuickRawIngredientDialog
        open={quickRawIngredientDialogOpen}
        onOpenChange={setQuickRawIngredientDialogOpen}
        unitOptions={unitOptions}
        onCreated={handleRawIngredientCreated}
      />
    </>
  );
}

export function ProductionRecipePanel({
  canManageCatalog,
  canManageRecipes,
  finishedGoods,
  unitOptions,
  ingredients,
  recipes,
  backHref,
  embedded = false,
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
        .filter(
          (ingredient) =>
            ingredient.item_kind === "raw_material" ||
            ingredient.item_kind === "finished_good",
        )
        .map((ingredient) => ({
          id: ingredient.id,
          name: ingredient.name,
          unit: ingredient.unit,
          production_unit_id: ingredient.production_unit_id ?? null,
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
          .filter(
            (ingredient) =>
              ingredient.item_kind === "raw_material" ||
              ingredient.item_kind === "finished_good",
          )
          .map((ingredient) => ({
            id: ingredient.id,
            name: ingredient.name,
            unit: ingredient.unit,
            production_unit_id: ingredient.production_unit_id ?? null,
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
        outputQuantity: recipe.output_quantity,
        lines: [recipe],
      });
    }

    return Array.from(groups.values()).sort((a, b) =>
      a.finishedGoodName.localeCompare(b.finishedGoodName, "vi"),
    );
  }, [recipes]);

  const recipeLinesEditorIngredients = useMemo(
    () =>
      rawIngredientsOptions.map((item) => ({
        id: item.id,
        name: item.name,
        unitLabel: item.unit,
        production_unit_id: item.production_unit_id ?? null,
        units: item.units,
      })),
    [rawIngredientsOptions],
  );

  const finishedGoodLocked = pendingFinishedGoodId != null;
  const operatorFlow = messages.inventory.operatorFlow;
  const recipeStep =
    finishedGoodsOptions.length === 0
      ? 1
      : rawIngredientsOptions.length === 0
        ? 2
        : groupedRecipes.length === 0
          ? 3
          : 4;

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
      oldFinishedGoodId: pendingFinishedGoodId
        ? Number(pendingFinishedGoodId)
        : undefined,
      outputQuantity: Number(values.output_quantity),
      lines: values.lines.map((line) => ({
        ingredientId: Number(line.ingredient_id),
        quantity: Number(line.quantity),
        entryUnitId: Number(line.entry_unit_id),
        note: line.note?.trim() || undefined,
      })),
    });

    if (!result.success && !result.error) {
      return { success: false, error: INVENTORY_VI.productionRecipeSaveFailed };
    }
    return result;
  }

  function handleRecipeSaved(_result: ActionResult, values: RecipeFormValues) {
    toast.success(INVENTORY_VI.productionRecipeSavedToast(values.lines.length));
    router.refresh();
  }

  function handleRecipeDelete(recipeId: number) {
    startTransition(async () => {
      const result = await deleteProductionRecipe(recipeId);
      if (!result.success) {
        toast.error(result.error ?? INVENTORY_VI.productionRecipeDeleteFailed);
        return;
      }
      toast.success(INVENTORY_VI.productionRecipeDeleted);
      router.refresh();
    });
  }

  async function handleRecipeGroupDelete(group: ProductionRecipeGroup) {
    const ok = await confirm({
      title: INVENTORY_VI.productionRecipeGroupDeleteTitle,
      description: INVENTORY_VI.productionRecipeGroupDeleteDescription(
        group.lines.length,
        group.finishedGoodName,
      ),
      confirmText: INVENTORY_VI.productionRecipeGroupDeleteConfirm,
      cancelText: ACTIONS_VI.cancel,
      variant: "destructive",
    });

    if (!ok) return;

    startTransition(async () => {
      const result = await deleteProductionRecipeGroup(group.finishedGoodId);
      if (!result.success) {
        toast.error(
          result.error ?? INVENTORY_VI.productionRecipeGroupDeleteFailed,
        );
        return;
      }
      toast.success(INVENTORY_VI.productionRecipeGroupDeleted);
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
          <div className="text-xs text-muted-foreground">
            {recipe.unitLabel}
          </div>
        </div>
      ),
    },
    {
      key: "quantity",
      header: FORM_VI.quantity,
      render: (recipe) => (
        <span>
          {formatQuantity(recipe.quantity)} {recipe.unitLabel}
        </span>
      ),
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
            className: "text-right",
            render: (recipe) => (
              <div className="flex items-center justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEditClick(recipe)}
                  aria-label={INVENTORY_VI.productionRecipeUpdateAria(
                    recipe.finished_good_name,
                  )}
                  title={INVENTORY_VI.productionRecipeUpdate}
                >
                  <IconPencil />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRecipeDelete(recipe.id)}
                  aria-label={INVENTORY_VI.productionRecipeDeleteLineAria(
                    recipe.ingredient_name,
                  )}
                  title={INVENTORY_VI.productionRecipeDeleteLine}
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
      {embedded && backHref ? (
        <Button
          variant="ghost"
          size="touch"
          className="self-start px-2"
          render={<Link href={backHref} />}
        >
          <IconArrowLeft data-icon="inline-start" />
          {INVENTORY_VI.productionBackToHub}
        </Button>
      ) : null}

      {embedded ? (
        <OperatorFlowSteps
          title={operatorFlow.productionRecipeTitle}
          description={operatorFlow.productionRecipeDescription}
          steps={operatorFlow.productionRecipeSteps}
          currentStep={recipeStep}
          tone={recipeStep >= 4 ? "success" : "default"}
        />
      ) : null}

      <AppSection
        title={INVENTORY_VI.productionRecipesTab}
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
                size={embedded ? "touch" : "default"}
                className={embedded ? "w-full sm:w-auto" : undefined}
                onClick={() => openRecipeDialog()}
              >
                <IconPlus data-icon="inline-start" />
                {INVENTORY_VI.productionRecipeCreate}
              </Button>
            </>
          ) : null
        }
      >
        <div className="flex flex-wrap gap-2">
          <Badge variant={badgeVariantFromTone("neutral")}>
            {INVENTORY_VI.finishedGoodsWithRecipeBadge(groupedRecipes.length)}
          </Badge>
          <Badge variant={badgeVariantFromTone("neutral")}>
            {INVENTORY_VI.ingredientLineCountBadge(recipes.length)}
          </Badge>
        </div>
      </AppSection>

      <FormDialog
        open={recipeDialogOpen}
        onOpenChange={handleRecipeDialogOpenChange}
        title={
          finishedGoodLocked
            ? INVENTORY_VI.productionRecipeUpdate
            : INVENTORY_VI.productionRecipeCreateTitle
        }
        description={INVENTORY_VI.productionRecipeDialogIntro}
        schema={recipeFormSchema}
        defaultValues={formDefaults}
        entityKey={formDefaults.finished_good_id || "new"}
        onSubmit={submitRecipe}
        onSuccess={handleRecipeSaved}
        submitLabel={INVENTORY_VI.productionRecipeSave}
        cancelLabel={ACTIONS_VI.cancel}
        actionSize={embedded ? "touch" : "default"}
        contentClassName="sm:max-w-5xl"
      >
        {(form) => (
          <RecipeDialogFields
            form={form}
            canManageCatalog={canManageCatalog}
            finishedGoodLocked={finishedGoodLocked}
            finishedGoodsOptions={finishedGoodsOptions}
            unitOptions={unitOptions}
            groupedRecipes={groupedRecipes}
            recipeLinesEditorIngredients={recipeLinesEditorIngredients}
            rawIngredientsOptions={rawIngredientsOptions}
            onFinishedGoodCreated={handleFinishedGoodCreated}
            onRawIngredientCreated={handleRawIngredientCreated}
            pendingFinishedGoodId={pendingFinishedGoodId}
          />
        )}
      </FormDialog>

      {groupedRecipes.length === 0 ? (
        <AppEmptyState
          mode="no-data"
          title={INVENTORY_VI.productionRecipeEmptyTitle}
          description={INVENTORY_VI.productionRecipeEmptyDescription}
          icon={<IconClipboardList className="size-5" />}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {groupedRecipes.map((group) => (
            <AppSection
              key={group.finishedGoodId}
              title={group.finishedGoodName}
              description={`${INVENTORY_VI.productionRecipeOutputQuantity} ${formatQuantity(group.outputQuantity)}`}
              badge={{
                children: INVENTORY_VI.ingredientCountBadge(group.lines.length),
                variant: badgeVariantFromTone("neutral"),
              }}
              action={
                canManageRecipes ? (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size={embedded ? "icon-touch" : "sm"}
                      onClick={() => openRecipeDialog(group.finishedGoodId)}
                      aria-label={INVENTORY_VI.productionRecipeUpdate}
                      title={INVENTORY_VI.productionRecipeUpdate}
                    >
                      <IconPencil
                        className={embedded ? "size-4" : undefined}
                        data-icon={embedded ? undefined : "inline-start"}
                      />
                      {!embedded && INVENTORY_VI.productionRecipeUpdate}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size={embedded ? "icon-touch" : "sm"}
                      onClick={() => handleRecipeGroupDelete(group)}
                      aria-label={
                        INVENTORY_VI.productionRecipeGroupDeleteConfirm
                      }
                      title={INVENTORY_VI.productionRecipeGroupDeleteConfirm}
                    >
                      <IconTrash
                        className={embedded ? "size-4" : undefined}
                        data-icon={embedded ? undefined : "inline-start"}
                      />
                      {!embedded &&
                        INVENTORY_VI.productionRecipeGroupDeleteConfirm}
                    </Button>
                  </div>
                ) : null
              }
              contentFlush
            >
              {embedded ? (
                <ItemGroup className="gap-2 border-t pt-2">
                  {group.lines.map((recipe) => (
                    <RecipeLineItemCard
                      key={recipe.id}
                      recipe={recipe}
                      canManageRecipes={canManageRecipes}
                      embedded={embedded}
                      onEdit={handleEditClick}
                      onDelete={handleRecipeDelete}
                    />
                  ))}
                </ItemGroup>
              ) : (
                <DataTable
                  columns={recipeLineColumns}
                  data={group.lines}
                  getRowKey={(recipe) => recipe.id}
                  mobileCardRender={(recipe) => (
                    <RecipeLineItemCard
                      recipe={recipe}
                      canManageRecipes={canManageRecipes}
                      embedded={embedded}
                      onEdit={handleEditClick}
                      onDelete={handleRecipeDelete}
                    />
                  )}
                />
              )}
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
  embedded,
  onEdit,
  onDelete,
}: {
  recipe: ProductionRecipeRow;
  canManageRecipes: boolean;
  embedded: boolean;
  onEdit: (recipe: ProductionRecipeRow) => void;
  onDelete: (recipeId: number) => void;
}) {
  if (embedded) {
    return (
      <Item variant="outline" size="sm">
        <ItemContent className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">
              {recipe.ingredient_name}
            </span>
            <Badge
              variant={badgeVariantFromTone("neutral")}
              className="shrink-0 font-mono text-xs"
            >
              {formatQuantity(recipe.quantity)} {recipe.unitLabel}
            </Badge>
          </div>
          <ItemDescription className="truncate text-xs">
            {recipe.note || "—"}
          </ItemDescription>
        </ItemContent>
        {canManageRecipes ? (
          <ItemActions className="shrink-0 gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-touch"
              onClick={() => onEdit(recipe)}
              aria-label={ACTIONS_VI.update}
            >
              <IconPencil className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-touch"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onDelete(recipe.id)}
              aria-label={ACTIONS_VI.delete}
            >
              <IconTrash className="size-4" />
            </Button>
          </ItemActions>
        ) : null}
      </Item>
    );
  }

  return (
    <Item variant="outline">
      <ItemHeader>
        <ItemTitle>{recipe.ingredient_name}</ItemTitle>
        <Badge variant={badgeVariantFromTone("neutral")}>
          {formatQuantity(recipe.quantity)} {recipe.unitLabel}
        </Badge>
      </ItemHeader>
      <ItemContent>
        <ItemDescription>
          {recipe.note ?? INVENTORY_VI.noNote}
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
              {ACTIONS_VI.update}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onDelete(recipe.id)}
            >
              <IconTrash data-icon="inline-start" />
              {ACTIONS_VI.delete}
            </Button>
          </ItemActions>
        </ItemFooter>
      ) : null}
    </Item>
  );
}
