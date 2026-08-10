"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Controller,
  useFieldArray,
  useWatch,
  type UseFormReturn,
} from "react-hook-form";
import { z } from "zod";
import {
  Ban as IconBan,
  ClipboardList as IconClipboardList,
  Pencil as IconPencil,
  Plus as IconPlus,
} from "lucide-react";
import { formatQuantity } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@/components/confirm-dialog";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import {
  InputGroup,
  InputGroupAddon,
} from "@comtammatu/ui/components/input-group";
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
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import {
  ComboboxField,
  FormDialog,
  QuantityInput,
} from "@/components/form";
import { AppListFrame } from "@/components/surface";
import {
  IngredientLinesEditor,
  type IngredientLineOption,
} from "./_components/ingredient-lines-editor";
import {
  deleteProductionRecipeGroup,
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
import type { UnitOption } from "@lib/inventory/types";
import type { ActionResult } from "@comtammatu/shared/types";
import { matchesSearch } from "@lib/search";

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
    output_unit_id: z
      .string()
      .min(1, { error: "Chọn đơn vị thành phẩm." })
      .refine((v) => Number(v) > 0, {
        error: "Đơn vị thành phẩm không hợp lệ.",
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
      output_quantity: String(group.outputQuantity),
      output_unit_id:
        group.outputUnitId != null ? String(group.outputUnitId) : "",
      lines:
        group.lines.length > 0
          ? group.lines.map(recipeToLineFormValue)
          : [emptyRecipeLine()],
    };
  }

  return {
    finished_good_id: defaultFinishedGoodId ?? "",
    output_quantity: "",
    output_unit_id: "",
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
  const selectedFinishedGoodId = useWatch({
    control: form.control,
    name: "finished_good_id",
  });
  const selectedFinishedGood = useMemo(
    () =>
      finishedGoodsOptions.find(
        (good) => String(good.id) === selectedFinishedGoodId,
      ) ?? null,
    [finishedGoodsOptions, selectedFinishedGoodId],
  );
  const outputUnitId = useWatch({
    control: form.control,
    name: "output_unit_id",
  });
  const outputUnitOptions = useMemo(
    () =>
      (selectedFinishedGood?.units ?? [])
        .filter((unit) => unit.is_active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((unit) => ({
          value: String(unit.unit_id),
          label: unit.unit_name?.trim() || unit.unit_code,
        })),
    [selectedFinishedGood],
  );
  const finishedGoodUnitLabel =
    outputUnitOptions.find((unit) => unit.value === outputUnitId)?.label ?? null;

  function handleFinishedGoodCreated(good: FinishedGoodOption) {
    onFinishedGoodCreated(good);
    form.setValue("finished_good_id", String(good.id));
    const defaultUnit = (good.units ?? []).find((unit) => unit.is_base && unit.is_active)
      ?? (good.units ?? []).find((unit) => unit.is_active);
    form.setValue(
      "output_unit_id",
      defaultUnit ? String(defaultUnit.unit_id) : "",
    );
    replaceRecipeLines([emptyRecipeLine()]);
  }

  function handleRawIngredientCreated(ingredient: RawIngredientOption) {
    onRawIngredientCreated(ingredient);
    const defaultUnit = (ingredient.units ?? []).find(
      (unit) => unit.is_base && unit.is_active,
    ) ?? (ingredient.units ?? []).find((unit) => unit.is_active);
    const lines = form.getValues("lines");
    const targetIndex = lines.findIndex((line) => !line.ingredient_id);
    const nextLine = {
      ...emptyRecipeLine(),
      ingredient_id: String(ingredient.id),
      unitLabel: defaultUnit?.unit_name?.trim() || defaultUnit?.unit_code || "",
      entry_unit_id: defaultUnit ? String(defaultUnit.unit_id) : "",
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

      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-2">
          <ComboboxField
            control={form.control}
            name="finished_good_id"
            id="recipe-finished-good"
            label={INVENTORY_VI.productionRecipeFinishedGoodLabel}
            options={availableFinishedGoodOptions}
            placeholder={INVENTORY_VI.selectFinishedGood}
            searchPlaceholder={INVENTORY_VI.searchFinishedGood}
            disabled={finishedGoodLocked}
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
        <Field
          data-invalid={!!form.formState.errors.output_quantity}
          className="gap-2"
        >
          <FieldLabel htmlFor="recipe-output-quantity">
            {INVENTORY_VI.productionRecipeOutputQuantityLabel}
          </FieldLabel>
          <InputGroup>
            <Controller
              control={form.control}
              name="output_quantity"
              render={({ field }) => (
                <QuantityInput
                  id="recipe-output-quantity"
                  name={field.name}
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  maxFractionDigits={3}
                  aria-invalid={!!form.formState.errors.output_quantity}
                  className="h-full"
                />
              )}
            />
            <InputGroupAddon align="inline-end" className="min-w-14 justify-center font-medium">
              {finishedGoodUnitLabel ?? "—"}
            </InputGroupAddon>
          </InputGroup>
          {form.formState.errors.output_quantity ? (
            <FieldError
              errors={[form.formState.errors.output_quantity]}
            />
          ) : null}
        </Field>
        <ComboboxField
          control={form.control}
          name="output_unit_id"
          id="recipe-output-unit"
          label={INVENTORY_VI.productionRecipeOutputUnitLabel}
          options={outputUnitOptions}
          placeholder={INVENTORY_VI.selectUnit}
          searchPlaceholder={INVENTORY_VI.searchUnit}
          description={
            selectedFinishedGood && outputUnitOptions.length === 0
              ? INVENTORY_VI.productionRecipeOutputUnitMissingDescription
              : undefined
          }
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
        bulkAdd
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("_all");
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
        outputQuantity: recipe.output_quantity,
        outputUnitLabel: recipe.output_unit_label,
        outputUnitId: recipe.output_unit_id,
        recipeSpecId: recipe.recipe_spec_id,
        status: recipe.status,
        lines: [recipe],
      });
    }

    const priority: Record<ProductionRecipeGroup["status"], number> = {
      needs_review: 0,
      active: 1,
      inactive: 2,
    };

    return Array.from(groups.values()).sort(
      (a, b) =>
        priority[a.status] - priority[b.status] ||
        a.finishedGoodName.localeCompare(b.finishedGoodName, "vi"),
    );
  }, [finishedGoodsOptions, recipes]);

  const recipeLinesEditorIngredients = useMemo(
    () =>
      rawIngredientsOptions.map((item) => ({
        id: item.id,
        name: item.name,
        unitLabel: item.unit,
        units: item.units,
      })),
    [rawIngredientsOptions],
  );

  const filteredRecipes = useMemo(() => {
    const query = search.trim();
    return groupedRecipes.filter((group) => {
      if (statusFilter !== "_all" && group.status !== statusFilter) return false;
      if (!query) return true;
      return matchesSearch(
        [
          group.finishedGoodName,
          ...group.lines.flatMap((line) => [line.ingredient_name, line.note]),
        ],
        query,
      );
    });
  }, [groupedRecipes, search, statusFilter]);

  const needsReviewCount = groupedRecipes.filter(
    (group) => group.status === "needs_review",
  ).length;
  const reviewingRecipe = groupedRecipes.some(
    (group) =>
      String(group.finishedGoodId) === pendingFinishedGoodId &&
      group.status === "needs_review",
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
      oldFinishedGoodId: pendingFinishedGoodId
        ? Number(pendingFinishedGoodId)
        : undefined,
      outputQuantity: Number(values.output_quantity),
      outputUnitId: Number(values.output_unit_id),
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

  async function handleRecipeGroupDelete(group: ProductionRecipeGroup) {
    const ok = await confirm({
      title: INVENTORY_VI.productionRecipeGroupDeleteTitle,
      description: INVENTORY_VI.productionRecipeGroupDeleteDescription(
        group.lines.length,
        group.finishedGoodName,
      ),
      confirmText: INVENTORY_VI.productionRecipeGroupDeleteConfirm,
      cancelText: ACTIONS_VI.cancel,
      variant: "default",
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

  function recipeRowActions(group: ProductionRecipeGroup): RowActionItem[] {
    if (!canManageRecipes) return [];
    return [
      {
        key: "edit",
        label:
          group.status === "needs_review"
            ? INVENTORY_VI.productionRecipeReview
            : INVENTORY_VI.productionRecipeUpdate,
        icon: <IconPencil />,
        onSelect: () => openRecipeDialog(group.finishedGoodId),
      },
      ...(group.status !== "inactive"
        ? [
            {
              key: "deactivate",
              label: INVENTORY_VI.productionRecipeGroupDeleteConfirm,
              icon: <IconBan />,
              onSelect: () => void handleRecipeGroupDelete(group),
              separatorBefore: true,
            } satisfies RowActionItem,
          ]
        : []),
    ];
  }

  const recipeColumns: DataTableColumn<ProductionRecipeGroup>[] = [
    {
      key: "finished_good",
      header: PRODUCT_VI.finishedGood,
      render: (group) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{group.finishedGoodName}</div>
          <div className="text-xs text-muted-foreground">
            {INVENTORY_VI.ingredientLineCountBadge(group.lines.length)}
          </div>
        </div>
      ),
    },
    {
      key: "output",
      header: INVENTORY_VI.productionRecipeOutputQuantity,
      className: "font-mono",
      render: (group) => (
        <span className="whitespace-nowrap">
          {formatQuantity(group.outputQuantity)} {group.outputUnitLabel || "—"}
        </span>
      ),
    },
    {
      key: "ingredients",
      header: INVENTORY_VI.productionRecipeLinesLabel,
      className: "min-w-72",
      render: (group) => (
        <div className="flex flex-col gap-1">
          {group.lines.map((line) => (
            <div key={line.id} className="flex min-w-0 justify-between gap-3">
              <span className="min-w-0 truncate text-muted-foreground">
                {line.ingredient_name}
              </span>
              <span className="shrink-0 whitespace-nowrap font-mono">
                {formatQuantity(line.quantity)} {line.unitLabel}
              </span>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: (group) => (
        <Badge variant={recipeStatusBadgeVariant(group.status)}>
          {recipeStatusLabel(group.status)}
        </Badge>
      ),
    },
    ...(canManageRecipes
      ? [
          {
            key: "actions",
            header: "",
            className: "w-14 text-right",
            render: (group) => (
              <div
                className="flex justify-end"
                onClick={(event) => event.stopPropagation()}
              >
                <RowActionsMenu
                  items={recipeRowActions(group)}
                  label={recipeActionAria(group)}
                  triggerSize="icon-sm"
                />
              </div>
            ),
          } satisfies DataTableColumn<ProductionRecipeGroup>,
        ]
      : []),
  ];

  return (
    <section className="flex flex-col gap-3">
      <AppListFrame
        title={INVENTORY_VI.productionRecipesTab}
        description={INVENTORY_VI.productionRecipesCardDescription}
        icon={<IconClipboardList />}
        badge={{
          children:
            needsReviewCount > 0
              ? INVENTORY_VI.productionRecipeNeedsReviewBadge(needsReviewCount)
              : INVENTORY_VI.finishedGoodsWithRecipeBadge(groupedRecipes.length),
          variant:
            needsReviewCount > 0
              ? badgeVariantFromTone("warning")
              : badgeVariantFromTone("success"),
        }}
        action={
          canManageRecipes ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <ProductionRecipeImportExportMenu
                onImported={() => router.refresh()}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => openRecipeDialog()}
              >
                <IconPlus data-icon="inline-start" />
                {INVENTORY_VI.productionRecipeCreate}
              </Button>
            </div>
          ) : null
        }
      >
        <DataTable
          columns={recipeColumns}
          data={filteredRecipes}
          pageSize={25}
          getRowKey={(group) => group.recipeSpecId}
          searchable
          searchPlaceholder={INVENTORY_VI.productionRecipeSearchPlaceholder}
          searchValue={search}
          onSearchChange={setSearch}
          filters={[
            {
              key: "status",
              label: FORM_VI.status,
              placeholder: FORM_VI.status,
              options: [
                {
                  value: "_all",
                  label: INVENTORY_VI.productionRecipeAllStatuses,
                },
                ...(["needs_review", "active", "inactive"] as const).map(
                  (status) => ({ value: status, label: recipeStatusLabel(status) }),
                ),
              ],
            },
          ]}
          filterValues={{ status: statusFilter }}
          onFilterChange={(_key, value) => setStatusFilter(value)}
          actions={
            <Badge variant="secondary">
              {INVENTORY_VI.productionRecipeListCount(
                filteredRecipes.length,
                groupedRecipes.length,
              )}
            </Badge>
          }
          emptyTitle={
            search || statusFilter !== "_all"
              ? INVENTORY_VI.productionRecipeNoResultsTitle
              : INVENTORY_VI.productionRecipeEmptyTitle
          }
          emptyDescription={
            search || statusFilter !== "_all"
              ? INVENTORY_VI.productionRecipeNoResultsDescription
              : INVENTORY_VI.productionRecipeEmptyDescription
          }
          emptyMode={
            search || statusFilter !== "_all" ? "no-results" : "no-data"
          }
          emptyIcon={<IconClipboardList className="size-5" />}
          onRowClick={
            canManageRecipes
              ? (group) => openRecipeDialog(group.finishedGoodId)
              : undefined
          }
          renderRowContextMenu={
            canManageRecipes
              ? (group) => (
                  <RowActionsContextMenuItems
                    items={recipeRowActions(group)}
                  />
                )
              : undefined
          }
          getRowAriaLabel={(group) =>
            canManageRecipes ? recipeActionAria(group) : undefined
          }
          mobileCardRender={(group) => (
            <RecipeGroupCard
              group={group}
              actions={recipeRowActions(group)}
              onOpen={
                canManageRecipes
                  ? () => openRecipeDialog(group.finishedGoodId)
                  : undefined
              }
            />
          )}
        />
      </AppListFrame>

      <FormDialog
        open={recipeDialogOpen}
        onOpenChange={handleRecipeDialogOpenChange}
        title={
          reviewingRecipe
            ? INVENTORY_VI.productionRecipeReview
            : finishedGoodLocked
              ? INVENTORY_VI.productionRecipeUpdate
              : INVENTORY_VI.productionRecipeCreateTitle
        }
        description={INVENTORY_VI.productionRecipeDialogIntro}
        schema={recipeFormSchema}
        defaultValues={formDefaults}
        entityKey={formDefaults.finished_good_id || "new"}
        onSubmit={submitRecipe}
        onSuccess={handleRecipeSaved}
        submitLabel={
          reviewingRecipe
            ? INVENTORY_VI.productionRecipeReviewSave
            : INVENTORY_VI.productionRecipeSave
        }
        cancelLabel={ACTIONS_VI.cancel}
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
    </section>
  );
}

function recipeStatusLabel(status: ProductionRecipeGroup["status"]): string {
  return {
    needs_review: INVENTORY_VI.productionRecipeNeedsReviewStatus,
    active: INVENTORY_VI.productionRecipeActiveStatus,
    inactive: INVENTORY_VI.productionRecipeInactiveStatus,
  }[status];
}

function recipeStatusBadgeVariant(status: ProductionRecipeGroup["status"]) {
  if (status === "active") return badgeVariantFromTone("success");
  if (status === "needs_review") return badgeVariantFromTone("warning");
  return badgeVariantFromTone("neutral");
}

function recipeActionAria(group: ProductionRecipeGroup): string {
  return group.status === "needs_review"
    ? INVENTORY_VI.productionRecipeReviewAria(group.finishedGoodName)
    : INVENTORY_VI.productionRecipeUpdateAria(group.finishedGoodName);
}

function RecipeGroupCard({
  group,
  actions,
  onOpen,
}: {
  group: ProductionRecipeGroup;
  actions: RowActionItem[];
  onOpen?: () => void;
}) {
  const overflowActions = actions.filter((action) => action.key !== "edit");

  return (
    <Item variant="outline">
      <ItemHeader>
        <ItemTitle>{group.finishedGoodName}</ItemTitle>
        <Badge variant={recipeStatusBadgeVariant(group.status)}>
          {recipeStatusLabel(group.status)}
        </Badge>
      </ItemHeader>
      <ItemContent>
        <ItemDescription>
          {INVENTORY_VI.productionRecipeOutputQuantity}: {formatQuantity(group.outputQuantity)}{" "}
          {group.outputUnitLabel || "—"} ·{" "}
          {INVENTORY_VI.ingredientLineCountBadge(group.lines.length)}
        </ItemDescription>
        <div className="mt-2 flex flex-col gap-1 rounded-md bg-muted/30 p-2 text-sm">
          {group.lines.map((line) => (
            <div key={line.id} className="flex min-w-0 justify-between gap-3">
              <span className="min-w-0 truncate text-muted-foreground">
                {line.ingredient_name}
              </span>
              <span className="shrink-0 whitespace-nowrap font-mono">
                {formatQuantity(line.quantity)} {line.unitLabel}
              </span>
            </div>
          ))}
        </div>
      </ItemContent>
      {onOpen || overflowActions.length > 0 ? (
        <ItemFooter>
          <ItemActions className="w-full justify-end">
            {onOpen ? (
              <Button type="button" variant="ghost" size="sm" onClick={onOpen}>
                <IconPencil data-icon="inline-start" />
                {group.status === "needs_review"
                  ? INVENTORY_VI.productionRecipeReview
                  : ACTIONS_VI.update}
              </Button>
            ) : null}
            {overflowActions.length > 0 ? (
              <RowActionsMenu
                items={overflowActions}
                label={recipeActionAria(group)}
                triggerSize="icon-touch"
              />
            ) : null}
          </ItemActions>
        </ItemFooter>
      ) : null}
    </Item>
  );
}
