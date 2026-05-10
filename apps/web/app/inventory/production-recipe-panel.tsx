"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Controller,
  useFieldArray,
  useForm,
  type UseFormReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ClipboardList as IconClipboardList,
  Pencil as IconPencil,
  Plus as IconPlus,
  Trash as IconTrash,
} from "lucide-react";
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
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { AppEmptyState } from "@/components/surface";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Combobox,
  MultiSelectCombobox,
  NumberField,
  TextField,
} from "@/components/form";
import { parseInventoryBulkLines } from "./_lib/bulk-line-parser";
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
    .min(1, { error: "Nhập hệ số sản lượng" })
    .refine((v) => Number(v) > 0, { error: "Hệ số sản lượng phải > 0" }),
  note: z.string().optional(),
});

const recipeFormSchema = z
  .object({
    finished_good_id: z
      .string()
      .min(1, { error: "Vui lòng chọn thành phẩm" })
      .refine((v) => Number(v) > 0, { error: "Thành phẩm không hợp lệ" }),
    lines: z.array(recipeLineItemSchema).min(1, {
      error: "Cần ít nhất một nguyên liệu trong công thức.",
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
          message: "Nguyên liệu bị trùng trong công thức.",
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

function parsePastedRecipeLines(
  rawText: string,
  rawIngredientsOptions: RawIngredientOption[],
) {
  const result = parseInventoryBulkLines({
    text: rawText,
    items: rawIngredientsOptions,
    getUnit: (ingredient) => ingredient.unit,
  });

  return {
    parsed: result.parsed.map(({ item, quantity, note }) => ({
      ingredient_id: String(item.id),
      quantity,
      unit: item.unit,
      yield_factor: "1",
      note,
    })),
    issues: result.issues,
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
    lines: [],
  };
}

function getNextRecipeFinishedGoodId(
  finishedGoods: FinishedGoodOption[],
  recipeGroups: ProductionRecipeGroup[],
) {
  const configuredIds = new Set(
    recipeGroups.map((group) => group.finishedGoodId),
  );
  const missingRecipeGood = finishedGoods.find(
    (good) => !configuredIds.has(good.id),
  );

  return missingRecipeGood?.id ?? finishedGoods[0]?.id;
}

function RecipeIngredientField({
  form,
  index,
  ingredientOptions,
  rawIngredientsOptions,
  selectedIngredientIds,
}: {
  form: UseFormReturn<RecipeFormValues, unknown, RecipeFormValues>;
  index: number;
  ingredientOptions: Array<{ value: string; label: string }>;
  rawIngredientsOptions: RawIngredientOption[];
  selectedIngredientIds: Set<string>;
}) {
  const fieldName = `lines.${index}.ingredient_id` as const;

  return (
    <Controller
      control={form.control}
      name={fieldName}
      render={({ field, fieldState }) => {
        const value = field.value ?? "";
        const options = ingredientOptions.map((option) => ({
          ...option,
          disabled:
            selectedIngredientIds.has(option.value) && option.value !== value,
        }));

        return (
          <Field data-invalid={!!fieldState.error}>
            <FieldLabel htmlFor={`recipe-line-${index}-ingredient`}>
              Nguyên liệu *
            </FieldLabel>
            <Combobox
              id={`recipe-line-${index}-ingredient`}
              value={value}
              options={options}
              placeholder="Chọn nguyên liệu"
              searchPlaceholder="Tìm nguyên liệu..."
              aria-invalid={!!fieldState.error}
              onValueChange={(nextValue) => {
                field.onChange(nextValue);
                const ingredient = rawIngredientsOptions.find(
                  (item) => item.id === Number(nextValue),
                );
                if (ingredient) {
                  form.setValue(`lines.${index}.unit`, ingredient.unit, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }
              }}
            />
            {fieldState.error ? (
              <FieldError errors={[fieldState.error]} />
            ) : null}
          </Field>
        );
      }}
    />
  );
}

function RecipeLineEditor({
  form,
  index,
  line,
  ingredientOptions,
  rawIngredientsOptions,
  selectedIngredientIds,
  onRemove,
}: {
  form: UseFormReturn<RecipeFormValues, unknown, RecipeFormValues>;
  index: number;
  line: RecipeLineItemFormValues;
  ingredientOptions: Array<{ value: string; label: string }>;
  rawIngredientsOptions: RawIngredientOption[];
  selectedIngredientIds: Set<string>;
  onRemove: () => void;
}) {
  const ingredient = rawIngredientsOptions.find(
    (item) => item.id === Number(line.ingredient_id),
  );
  const lineError = form.formState.errors.lines?.[index];

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Dòng {index + 1}</Badge>
            {ingredient ? (
              <Badge variant="outline">{ingredient.unit}</Badge>
            ) : null}
          </div>
          <div className="min-h-5 truncate font-medium">
            {ingredient?.name ?? "Chưa chọn nguyên liệu"}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label={`Xóa dòng nguyên liệu ${index + 1}`}
          title="Xóa dòng nguyên liệu"
        >
          <IconTrash />
        </Button>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-12">
        <div className="xl:col-span-4">
          <RecipeIngredientField
            form={form}
            index={index}
            ingredientOptions={ingredientOptions}
            rawIngredientsOptions={rawIngredientsOptions}
            selectedIngredientIds={selectedIngredientIds}
          />
        </div>
        <div className="xl:col-span-2">
          <NumberField
            control={form.control}
            name={`lines.${index}.quantity` as const}
            label="Số lượng"
            maxFractionDigits={3}
            required
          />
        </div>
        <div className="xl:col-span-2">
          <Field data-invalid={!!lineError?.unit}>
            <FieldLabel>Đơn vị</FieldLabel>
            <div className="flex h-7 items-center rounded-md border border-input bg-muted/40 px-2 text-sm text-muted-foreground">
              {line.unit || "Tự động"}
            </div>
            {lineError?.unit?.message ? (
              <FieldError>{lineError.unit.message}</FieldError>
            ) : null}
          </Field>
        </div>
        <div className="xl:col-span-2">
          <NumberField
            control={form.control}
            name={`lines.${index}.yield_factor` as const}
            label="Hệ số sản lượng"
            maxFractionDigits={3}
            required
          />
        </div>
        <div className="md:col-span-2 xl:col-span-2">
          <TextField
            control={form.control}
            name={`lines.${index}.note` as const}
            label="Ghi chú"
            placeholder="Hao hụt..."
          />
        </div>
      </div>
    </div>
  );
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
  const [bulkText, setBulkText] = useState("");
  const [bulkIssues, setBulkIssues] = useState<string[]>([]);
  const [editingRecipeGroup, setEditingRecipeGroup] =
    useState<ProductionRecipeGroup | null>(null);
  const [recipeGroupToDelete, setRecipeGroupToDelete] =
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
    remove: removeRecipeLine,
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
  const nextRecipeFinishedGoodId = getNextRecipeFinishedGoodId(
    finishedGoodsOptions,
    groupedRecipes,
  );

  const ingredientOptions = rawIngredientsOptions.map((item) => ({
    value: String(item.id),
    label: item.name,
  }));
  const rawIngredientById = useMemo(() => {
    const map = new Map<string, RawIngredientOption>();
    rawIngredientsOptions.forEach((ingredient) => {
      map.set(String(ingredient.id), ingredient);
    });
    return map;
  }, [rawIngredientsOptions]);

  const watchedLines = form.watch("lines") ?? [];
  const watchedFinishedGoodId = form.watch("finished_good_id");
  const selectedIngredientIds = useMemo(
    () =>
      new Set(
        watchedLines
          .map((line) => line.ingredient_id)
          .filter((value): value is string => value.length > 0),
      ),
    [watchedLines],
  );
  const finishedGoodLocked = pendingFinishedGoodId != null;
  const selectedRecipeGroup = useMemo(
    () =>
      groupedRecipes.find(
        (group) => group.finishedGoodId === Number(watchedFinishedGoodId),
      ) ?? null,
    [groupedRecipes, watchedFinishedGoodId],
  );
  const isUpdatingExistingRecipe = selectedRecipeGroup != null;

  useEffect(() => {
    if (!recipeDialogOpen) return;

    const initialFinishedGoodId =
      pendingFinishedGoodId ??
      (editingRecipeGroup
        ? String(editingRecipeGroup.finishedGoodId)
        : nextRecipeFinishedGoodId != null
          ? String(nextRecipeFinishedGoodId)
          : defaultFinishedGoodId);
    const initialGroup =
      editingRecipeGroup ??
      groupedRecipes.find(
        (group) => group.finishedGoodId === Number(initialFinishedGoodId),
      ) ??
      null;

    form.reset(toRecipeFormValues(initialGroup, initialFinishedGoodId));
    setServerError(null);
    setBulkText("");
    setBulkIssues([]);
  }, [
    recipeDialogOpen,
    editingRecipeGroup,
    pendingFinishedGoodId,
    defaultFinishedGoodId,
    nextRecipeFinishedGoodId,
    groupedRecipes,
    form,
  ]);

  function replaceRecipeLinesForFinishedGood(finishedGoodId: string) {
    const group =
      groupedRecipes.find(
        (item) => item.finishedGoodId === Number(finishedGoodId),
      ) ?? null;
    replaceRecipeLines(
      group?.lines.length ? group.lines.map(recipeToLineFormValue) : [],
    );
  }

  function handleBulkAddIngredients(ingredientIds: string[]) {
    const keptLines = (form.getValues("lines") ?? []).filter(
      (line) => line.ingredient_id,
    );
    const seenIds = new Set(keptLines.map((line) => line.ingredient_id));
    const nextLines = [...keptLines];

    ingredientIds.forEach((ingredientId) => {
      if (seenIds.has(ingredientId)) return;
      const ingredient = rawIngredientById.get(ingredientId);
      if (!ingredient) return;
      nextLines.push({
        ingredient_id: ingredientId,
        quantity: "1",
        unit: ingredient.unit,
        yield_factor: "1",
        note: "",
      });
      seenIds.add(ingredientId);
    });

    replaceRecipeLines(nextLines.length > 0 ? nextLines : [emptyRecipeLine()]);
    setBulkIssues([]);
  }

  function handleApplyPastedLines() {
    const { parsed, issues } = parsePastedRecipeLines(
      bulkText,
      rawIngredientsOptions,
    );

    if (parsed.length === 0) {
      setBulkIssues(issues.length > 0 ? issues : ["Không có dòng hợp lệ"]);
      return;
    }

    const nextLines = (form.getValues("lines") ?? []).filter(
      (line) => line.ingredient_id,
    );
    const indexByIngredientId = new Map<string, number>();
    nextLines.forEach((line, index) => {
      indexByIngredientId.set(line.ingredient_id, index);
    });

    parsed.forEach((line) => {
      const existingIndex = indexByIngredientId.get(line.ingredient_id);
      if (existingIndex == null) {
        indexByIngredientId.set(line.ingredient_id, nextLines.length);
        nextLines.push(line);
        return;
      }

      const existingLine = nextLines[existingIndex];
      if (!existingLine) return;
      nextLines[existingIndex] = {
        ...existingLine,
        quantity: line.quantity,
        unit: line.unit,
        yield_factor: existingLine.yield_factor || "1",
        note: line.note || existingLine.note,
      };
    });

    replaceRecipeLines(nextLines);
    setBulkText("");
    setBulkIssues(issues);
    toast.success(`Đã nhập nhanh ${parsed.length} dòng nguyên liệu`);
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
    replaceRecipeLines([]);
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
        setServerError(result.error ?? "Không thể lưu công thức sản xuất");
        return;
      }
      toast.success(`Đã lưu ${values.lines.length} nguyên liệu trong công thức`);
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

  function handleEditClick(recipe: ProductionRecipeRow) {
    openRecipeDialog(recipe.finished_good_id);
  }

  return (
    <section id="production-recipes" className="flex flex-col gap-3">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <IconClipboardList />
            Công thức sản xuất
          </CardTitle>
          {canManageRecipes ? (
            <CardAction className="col-span-full col-start-1 row-span-1 row-start-2 flex flex-wrap justify-start gap-2 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:justify-self-end">
              <ProductionRecipeImportExportMenu
                onImported={() => router.refresh()}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => openRecipeDialog()}
              >
                <IconPlus data-icon="inline-start" />
                Nhập công thức
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant={badgeVariantFromTone("neutral")}>
            {groupedRecipes.length} thành phẩm có công thức
          </Badge>
          <Badge variant={badgeVariantFromTone("neutral")}>
            {recipes.length} dòng nguyên liệu
          </Badge>
        </CardContent>
      </Card>

      <Dialog
        open={recipeDialogOpen}
        onOpenChange={handleRecipeDialogOpenChange}
      >
        <DialogContent size="5xl">
          <DialogHeader>
            <DialogTitle>
              {finishedGoodLocked || isUpdatingExistingRecipe
                ? "Cập nhật công thức"
                : "Nhập công thức sản xuất"}
            </DialogTitle>
            <DialogDescription>
              {isUpdatingExistingRecipe
                ? "Thành phẩm này đã có công thức; danh sách lưu sẽ thay thế nội dung hiện tại."
                : "Ưu tiên thành phẩm chưa có công thức. Dán danh sách để thêm nhiều nguyên liệu một lượt."}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={form.handleSubmit(onValid)}
            noValidate
            className="flex flex-col gap-4"
          >
            <FieldGroup
              className={recipeLineFields.length > 0 ? "sm:pb-24" : undefined}
            >
              <div className="grid gap-3 md:grid-cols-2">
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
                      variant="ghost"
                      size="sm"
                      className="justify-start"
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
                <div className="rounded-md border border-border bg-card p-3">
                  <Field>
                    <FieldLabel htmlFor="production-bom-paste">
                      Dán danh sách nguyên liệu
                    </FieldLabel>
                    <Textarea
                      id="production-bom-paste"
                      value={bulkText}
                      onChange={(event) => setBulkText(event.target.value)}
                      placeholder={"Thịt ba chỉ 2 kg\nNước mắm 0,5 lít"}
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="mt-3 w-full"
                    onClick={handleApplyPastedLines}
                    disabled={!bulkText.trim()}
                  >
                    Áp dụng danh sách
                  </Button>
                  {bulkIssues.length > 0 ? (
                    <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                      <div className="font-medium">
                        {bulkIssues.length} dòng cần kiểm tra
                      </div>
                      <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
                        {bulkIssues.slice(0, 4).map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                      {bulkIssues.length > 4 ? (
                        <div className="mt-1">
                          Còn {bulkIssues.length - 4} dòng khác.
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-md border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">Thêm nhanh</span>
                    <span className="text-xs text-muted-foreground">
                      {selectedIngredientIds.size} nguyên liệu đã chọn
                    </span>
                  </div>
                  <Badge variant="secondary">
                    {rawIngredientsOptions.length} có thể chọn
                  </Badge>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <MultiSelectCombobox
                    options={rawIngredientsOptions.map((ingredient) => ({
                      value: String(ingredient.id),
                      label: ingredient.name,
                      hint: ingredient.unit,
                      alreadySelected: selectedIngredientIds.has(
                        String(ingredient.id),
                      ),
                    }))}
                    onConfirm={handleBulkAddIngredients}
                    triggerLabel="Chọn nhiều nguyên liệu"
                    confirmLabel={(count) =>
                      count > 0
                        ? `Thêm ${count} nguyên liệu`
                        : "Thêm nguyên liệu"
                    }
                    searchPlaceholder="Tìm nguyên liệu..."
                    triggerClassName="w-full"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => appendRecipeLine(emptyRecipeLine())}
                  >
                    <IconPlus data-icon="inline-start" />
                    Thêm dòng trống
                  </Button>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {canManageCatalog ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setQuickRawIngredientDialogOpen(true)}
                    >
                      <IconPlus data-icon="inline-start" />
                      Tạo nguyên liệu
                    </Button>
                  ) : null}
                  {!canManageCatalog && rawIngredientsOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Chưa có nguyên liệu đầu vào trong danh mục.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Dòng nguyên liệu</span>
                  <span className="text-xs text-muted-foreground">
                    {recipeLineFields.length} nguyên liệu trong lần lưu này
                  </span>
                </div>
                <Badge variant="outline">Công thức</Badge>
              </div>

              <div className="flex flex-col gap-3">
                {recipeLineFields.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                    Dán danh sách, chọn nhiều nguyên liệu hoặc thêm dòng trống
                    để bắt đầu công thức.
                  </div>
                ) : (
                  recipeLineFields.map((lineField, index) => (
                    <RecipeLineEditor
                      key={lineField.id}
                      form={form}
                      index={index}
                      line={watchedLines[index] ?? emptyRecipeLine()}
                      ingredientOptions={ingredientOptions}
                      rawIngredientsOptions={rawIngredientsOptions}
                      selectedIngredientIds={selectedIngredientIds}
                      onRemove={() => removeRecipeLine(index)}
                    />
                  ))
                )}
              </div>

              {serverError && (
                <p className="text-sm text-destructive" role="alert">
                  {serverError}
                </p>
              )}
            </FieldGroup>

            {recipeLineFields.length > 0 ? (
              <DialogFooter className="flex-col border-t bg-popover pt-3 sm:sticky sm:bottom-0 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleRecipeDialogOpenChange(false)}
                  disabled={isPending}
                  size="touch"
                  className="w-full sm:w-auto"
                >
                  {ACTIONS_VI.cancel}
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  size="touch"
                  className="w-full sm:w-auto"
                >
                  {isPending && <Spinner data-icon="inline-start" />}
                  Lưu công thức ({recipeLineFields.length})
                </Button>
              </DialogFooter>
            ) : null}
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
            <AlertDialogTitle>Xóa toàn bộ công thức?</AlertDialogTitle>
            <AlertDialogDescription>
              {recipeGroupToDelete
                ? `Thao tác này sẽ xóa toàn bộ ${recipeGroupToDelete.lines.length} dòng nguyên liệu của "${recipeGroupToDelete.finishedGoodName}".`
                : "Thao tác này sẽ xóa toàn bộ công thức của thành phẩm đã chọn."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {ACTIONS_VI.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRecipeGroupDelete}
              disabled={isPending}
            >
              {isPending && <Spinner data-icon="inline-start" />}
              Xóa toàn bộ công thức
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {groupedRecipes.length === 0 ? (
        <AppEmptyState
          mode="no-data"
          title="Chưa có công thức nào"
          description="Hãy thêm ít nhất một dòng nguyên liệu để bắt đầu cấu hình công thức cho thành phẩm."
          icon={<IconClipboardList className="size-5" />}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {groupedRecipes.map((group) => (
            <Card key={group.finishedGoodId}>
              <CardHeader className="border-b">
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {group.finishedGoodName}
                  <Badge variant={badgeVariantFromTone("neutral")}>
                    {group.lines.length} nguyên liệu
                  </Badge>
                </CardTitle>
                {canManageRecipes ? (
                  <CardAction className="col-span-full col-start-1 row-span-1 row-start-2 flex flex-wrap justify-start gap-2 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:justify-self-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openRecipeDialog(group.finishedGoodId)}
                    >
                      <IconPencil data-icon="inline-start" />
                      Cập nhật công thức
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setRecipeGroupToDelete(group)}
                    >
                      <IconTrash data-icon="inline-start" />
                      Xóa toàn bộ công thức
                    </Button>
                  </CardAction>
                ) : null}
              </CardHeader>

              <CardContent className="flex flex-col gap-2 md:hidden">
                {group.lines.map((recipe) => (
                  <div
                    key={recipe.id}
                    className="rounded-md border border-border p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {recipe.ingredient_name}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {recipe.note ?? "Không có ghi chú"}
                        </div>
                      </div>
                      <div className="shrink-0 text-right font-mono">
                        {recipe.quantity} {recipe.unit}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{recipe.unit}</Badge>
                        <Badge variant="secondary">
                          Hệ số {recipe.yield_factor}
                        </Badge>
                      </div>
                      {canManageRecipes ? (
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditClick(recipe)}
                            aria-label={`Cập nhật công thức ${recipe.finished_good_name}`}
                            title="Cập nhật công thức"
                          >
                            <IconPencil data-icon="inline-start" />
                            Sửa
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleRecipeDelete(recipe.id)}
                            aria-label={`Xóa nguyên liệu ${recipe.ingredient_name}`}
                            title="Xóa nguyên liệu"
                          >
                            <IconTrash />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </CardContent>

              <CardContent className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{PRODUCT_VI.rawIngredient}</TableHead>
                      <TableHead>{FORM_VI.quantity}</TableHead>
                      <TableHead>Hệ số sản lượng</TableHead>
                      <TableHead>{FORM_VI.notes}</TableHead>
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
                                aria-label={`Cập nhật công thức ${recipe.finished_good_name}`}
                                title="Cập nhật công thức"
                              >
                                <IconPencil />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRecipeDelete(recipe.id)}
                                aria-label={`Xóa nguyên liệu ${recipe.ingredient_name}`}
                                title="Xóa nguyên liệu"
                              >
                                <IconTrash />
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
    </section>
  );
}
