"use client";

import { useMemo } from "react";
import { z } from "zod";
import { toast } from "@comtammatu/ui/components/sonner";
import { FormDialog, SelectField } from "@/components/form";
import { IngredientLinesEditor } from "../_components/ingredient-lines-editor";
import type { IngredientUnitRow } from "@lib/inventory/types";
import type { MenuRecipeCostSignal } from "../_lib/menu-recipe-cost";
import { upsertMenuRecipeLines } from "../menu-recipe-actions";
import { ACTIONS_VI, INVENTORY_VI } from "@comtammatu/shared/messages";

export interface MenuItemOption {
  id: number;
  name: string;
}

export interface IngredientOption {
  id: number;
  name: string;
  unitLabel: string;
  units?: IngredientUnitRow[];
  costSignals?: readonly MenuRecipeCostSignal[];
}

export interface MenuRecipeLineDraft {
  ingredientId: number;
  quantity: number;
  unitLabel: string;
  entryUnitId: number | null;
  note: string | null;
  isPrimary?: boolean;
}

/* ─── Schema ─── */

const menuRecipeLineRowSchema = z.object({
  ingredient_id: z.string().min(1, { error: INVENTORY_VI.selectIngredient }),
  quantity: z
    .string()
    .min(1, { error: INVENTORY_VI.enterQuantity })
    .refine((v) => Number(v) > 0, { error: INVENTORY_VI.quantityPositive }),
  unitLabel: z.string().optional(),
  entry_unit_id: z.string().min(1, { error: INVENTORY_VI.selectUnit }),
  note: z.string().max(200, { error: INVENTORY_VI.noteMax200 }).optional(),
  is_primary: z.boolean().optional().default(false),
});

const menuRecipeSchema = z.object({
  menu_item_id: z
    .string()
    .min(1, { error: INVENTORY_VI.selectMenuItemRequired }),
  lines: z
    .array(menuRecipeLineRowSchema)
    .min(1, { error: INVENTORY_VI.menuRecipeMinIngredients })
    .refine(
      (arr) => {
        const ids = arr.map((row) => row.ingredient_id).filter(Boolean);
        return new Set(ids).size === ids.length;
      },
      { error: INVENTORY_VI.menuRecipeDuplicateIngredient },
    ),
});

type MenuRecipeFormValues = z.infer<typeof menuRecipeSchema>;
type MenuRecipeLineRow = z.infer<typeof menuRecipeLineRowSchema>;

const EMPTY_ROW: MenuRecipeLineRow = {
  ingredient_id: "",
  quantity: "",
  unitLabel: "",
  entry_unit_id: "",
  note: "",
  is_primary: false,
};

/* ─── Dialog ─── */

interface MenuRecipeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menuItems: MenuItemOption[];
  ingredients: IngredientOption[];
  editingMenuItemId?: number;
  editingLines?: MenuRecipeLineDraft[];
  existingMenuItemIds?: number[];
  onSaved: () => void;
}

export function MenuRecipeLineDialog({
  open,
  onOpenChange,
  menuItems,
  ingredients,
  editingMenuItemId,
  editingLines,
  existingMenuItemIds = [],
  onSaved,
}: MenuRecipeDialogProps) {
  const isEdit = editingMenuItemId != null;

  const initialValues = useMemo<MenuRecipeFormValues>(
    () => ({
      menu_item_id: editingMenuItemId ? String(editingMenuItemId) : "",
      lines:
        editingLines && editingLines.length > 0
          ? editingLines.map((l) => ({
              ingredient_id: String(l.ingredientId),
              quantity: String(l.quantity),
              unitLabel: l.unitLabel,
              entry_unit_id: l.entryUnitId ? String(l.entryUnitId) : "",
              note: l.note ?? "",
              is_primary: l.isPrimary ?? false,
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

  async function handleSubmit(values: MenuRecipeFormValues) {
    const menuItemId = Number(values.menu_item_id);
    const parsedLines = values.lines.map((row) => ({
      ingredientId: Number(row.ingredient_id),
      quantity: Number(row.quantity),
      entryUnitId: row.entry_unit_id ? Number(row.entry_unit_id) : null,
      note: row.note?.trim() ? row.note.trim() : null,
      isPrimary: Boolean(row.is_primary),
    }));

    return upsertMenuRecipeLines({
      menuItemId,
      oldMenuItemId: editingMenuItemId ? Number(editingMenuItemId) : undefined,
      lines: parsedLines,
    });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        isEdit
          ? INVENTORY_VI.editMenuRecipeTitle
          : INVENTORY_VI.createMenuRecipeTitle
      }
      description={INVENTORY_VI.menuRecipeDescription}
      schema={menuRecipeSchema}
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
      submitLabel={
        isEdit
          ? INVENTORY_VI.updateMenuRecipeBtn
          : INVENTORY_VI.saveMenuRecipeBtn
      }
      cancelLabel={ACTIONS_VI.cancel}
      contentClassName="sm:max-w-3xl"
    >
      {(form) => {
        const errors = form.formState.errors;
        const linesRootError =
          errors.lines?.root?.message ?? errors.lines?.message;

        return (
          <>
            <SelectField
              control={form.control}
              name="menu_item_id"
              id="menu-recipe-menu-item"
              label={INVENTORY_VI.menuRecipeMenuItemLabel}
              options={availableMenuItems.map((item) => ({
                value: String(item.id),
                label: item.name,
              }))}
              placeholder={INVENTORY_VI.selectMenuItemPlaceholder}
              description={
                availableMenuItems.length === 0
                  ? INVENTORY_VI.allMenuItemsHaveMenuRecipe
                  : undefined
              }
              required
            />

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">
                {INVENTORY_VI.ingredientListLabel}
              </h3>

              <p className="text-sm text-muted-foreground">
                {INVENTORY_VI.menuRecipeCostSignalsHint}
              </p>

              <IngredientLinesEditor
                control={form.control}
                setValue={form.setValue}
                getValues={form.getValues}
                errors={errors}
                ingredients={ingredients}
                bulkAdd
                unitEditable
                showPrimaryToggle
              />

              {linesRootError && (
                <p className="text-sm text-destructive" role="alert">
                  {linesRootError}
                </p>
              )}
            </div>
          </>
        );
      }}
    </FormDialog>
  );
}
