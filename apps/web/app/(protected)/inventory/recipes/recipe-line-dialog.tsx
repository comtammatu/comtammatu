"use client";

import { useMemo } from "react";
import { Controller } from "react-hook-form";
import { z } from "zod";
import { cn } from "@comtammatu/ui";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { FormDialog } from "@/components/form";
import { RecipeLinesEditor } from "../_components/recipe-lines-editor";
import type { IngredientUnitRow } from "../_lib/types";
import { upsertRecipeLines } from "../procurement-actions";
import { ACTIONS_VI, INVENTORY_VI } from "@comtammatu/shared/messages";

export interface MenuItemOption {
  id: number;
  name: string;
}

export interface IngredientOption {
  id: number;
  name: string;
  unit: string;
  units?: IngredientUnitRow[];
}

export interface RecipeLineDraft {
  ingredientId: number;
  quantity: number;
  unit: string;
  entryUnitId: number | null;
  yieldFactor: number;
  note: string | null;
}

/* ─── Schema ─── */

const recipeLineRowSchema = z.object({
  ingredient_id: z.string().min(1, { error: INVENTORY_VI.selectIngredient }),
  quantity: z
    .string()
    .min(1, { error: INVENTORY_VI.enterQuantity })
    .refine((v) => Number(v) > 0, { error: INVENTORY_VI.quantityPositive }),
  unit: z.string().optional(),
  entry_unit_id: z.string().optional(),
  yield_factor: z
    .string()
    .min(1, { error: INVENTORY_VI.enterYield })
    .refine((v) => Number(v) > 0, { error: INVENTORY_VI.yieldPositive }),
  note: z.string().max(200, { error: INVENTORY_VI.noteMax200 }).optional(),
});

const recipeSchema = z.object({
  menu_item_id: z.string().min(1, { error: INVENTORY_VI.selectMenuItemRequired }),
  lines: z
    .array(recipeLineRowSchema)
    .min(1, { error: INVENTORY_VI.recipeMinIngredients })
    .refine(
      (arr) => {
        const ids = arr.map((row) => row.ingredient_id).filter(Boolean);
        return new Set(ids).size === ids.length;
      },
      { error: INVENTORY_VI.recipeDuplicateIngredient },
    ),
});

type RecipeFormValues = z.infer<typeof recipeSchema>;
type RecipeLineRow = z.infer<typeof recipeLineRowSchema>;

const EMPTY_ROW: RecipeLineRow = {
  ingredient_id: "",
  quantity: "",
  unit: "",
  entry_unit_id: "",
  yield_factor: "1",
  note: "",
};

/* ─── Dialog ─── */

interface RecipeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menuItems: MenuItemOption[];
  ingredients: IngredientOption[];
  editingMenuItemId?: number;
  editingLines?: RecipeLineDraft[];
  existingMenuItemIds?: number[];
  onSaved: () => void;
}

export function RecipeLineDialog({
  open,
  onOpenChange,
  menuItems,
  ingredients,
  editingMenuItemId,
  editingLines,
  existingMenuItemIds = [],
  onSaved,
}: RecipeDialogProps) {
  const isEdit = editingMenuItemId != null;

  const initialValues = useMemo<RecipeFormValues>(
    () => ({
      menu_item_id: editingMenuItemId ? String(editingMenuItemId) : "",
      lines:
        editingLines && editingLines.length > 0
          ? editingLines.map((l) => ({
              ingredient_id: String(l.ingredientId),
              quantity: String(l.quantity),
              unit: l.unit,
              entry_unit_id: l.entryUnitId ? String(l.entryUnitId) : "",
              yield_factor: String(l.yieldFactor),
              note: l.note ?? "",
            }))
          : [EMPTY_ROW],
    }),
    [editingMenuItemId, editingLines],
  );

  const availableMenuItems = useMemo(() => {
    const blocked = new Set(existingMenuItemIds);
    if (editingMenuItemId != null) {
      blocked.delete(editingMenuItemId);
    }
    return menuItems.filter((mi) => !blocked.has(mi.id));
  }, [menuItems, existingMenuItemIds, editingMenuItemId]);

  async function handleSubmit(values: RecipeFormValues) {
    const menuItemId = Number(values.menu_item_id);
    const parsedLines = values.lines.map((row) => ({
      ingredientId: Number(row.ingredient_id),
      quantity: Number(row.quantity),
      entryUnitId: row.entry_unit_id ? Number(row.entry_unit_id) : null,
      yieldFactor: Number(row.yield_factor || "1"),
      note: row.note?.trim() ? row.note.trim() : null,
    }));

    return upsertRecipeLines({
      menuItemId,
      oldMenuItemId: editingMenuItemId ? Number(editingMenuItemId) : undefined,
      lines: parsedLines,
    });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? INVENTORY_VI.editRecipeTitle : INVENTORY_VI.createRecipeTitle}
      description={INVENTORY_VI.recipeDescription}
      schema={recipeSchema}
      defaultValues={initialValues}
      entityKey={editingMenuItemId ?? "new"}
      onSubmit={handleSubmit}
      onSuccess={(_, values) => {
        toast.success(
          isEdit
            ? `Đã cập nhật định mức món bán (${values.lines.length} nguyên liệu)`
            : `Đã tạo định mức món bán (${values.lines.length} nguyên liệu)`,
        );
        onSaved();
      }}
      submitLabel={isEdit ? INVENTORY_VI.updateRecipeBtn : INVENTORY_VI.saveRecipeBtn}
      cancelLabel={ACTIONS_VI.cancel}
      contentClassName="sm:max-w-3xl"
    >
      {(form) => {
        const errors = form.formState.errors;
        const linesRootError =
          errors.lines?.root?.message ?? errors.lines?.message;

        return (
          <>
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium">{INVENTORY_VI.recipeMenuItemLabel}</Label>
            <Controller
              control={form.control}
              name="menu_item_id"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={false}
                >
                  <SelectTrigger
                    className={cn(
                      "h-10",
                      errors.menu_item_id && "border-destructive",
                    )}
                    aria-invalid={!!errors.menu_item_id}
                    onBlur={field.onBlur}
                    ref={field.ref}
                  >
                    <SelectValue placeholder={INVENTORY_VI.selectMenuItemPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMenuItems.length === 0 ? (
                      <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                        {INVENTORY_VI.allMenuItemsHaveRecipe}
                      </div>
                    ) : (
                      availableMenuItems.map((mi) => (
                        <SelectItem key={mi.id} value={String(mi.id)}>
                          {mi.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.menu_item_id && (
              <p className="text-xs text-destructive" role="alert">
                {errors.menu_item_id.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium">
              {INVENTORY_VI.ingredientListLabel}
            </Label>

            <RecipeLinesEditor
              control={form.control}
              setValue={form.setValue}
              getValues={form.getValues}
              errors={errors}
              ingredients={ingredients}
              bulkAdd
            />

            {linesRootError && (
              <p className="text-sm text-destructive" role="alert">
                {linesRootError}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {INVENTORY_VI.yieldHint}
            </p>
          </div>
          </>
        );
      }}
    </FormDialog>
  );
}
