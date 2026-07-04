"use client";

import { z } from "zod";
import { FORM_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
import { FormDialog, SelectField, TextField } from "@/components/form";
import { quickCreateIngredient } from "./ingredient-actions";
import type {
  FinishedGoodOption,
  RawIngredientOption,
} from "./production-types";
import { STORAGE_OPTIONS } from "./_lib/constants";

type StorageType = "ambient" | "refrigerated" | "frozen";

const quickCreateSchema = z.object({
  name: z.string().trim().min(1, { error: INVENTORY_VI.quickCreateNameRequired }),
  unit: z.string().trim().min(1, { error: INVENTORY_VI.unitRequired }),
  category: z.string().trim().optional(),
  storage_type: z.enum(["ambient", "refrigerated", "frozen"]),
});

type QuickCreateFormValues = z.infer<typeof quickCreateSchema>;

interface QuickCreateDialogConfig {
  title: string;
  intro: string;
  nameLabel: string;
  namePlaceholder: string;
  unitLabel: string;
  unitPlaceholder: string;
  categoryLabel: string;
  categoryDefault: string;
  categoryPlaceholder: string;
  itemKind: "raw_material" | "finished_good";
  submitLabel: string;
  successMessage: string;
  errorFallback: string;
  readIdError: string;
}

function QuickCreateDialog<TCreated>({
  open,
  onOpenChange,
  config,
  onCreated,
  mapCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: QuickCreateDialogConfig;
  onCreated?: (value: TCreated) => void;
  mapCreated: (input: { id: number; name: string; unit: string }) => TCreated;
}) {
  const defaultValues: QuickCreateFormValues = {
    name: "",
    unit: "",
    category: config.categoryDefault,
    storage_type: "ambient",
  };

  async function handleSubmit(values: QuickCreateFormValues) {
    const result = await quickCreateIngredient({
      name: values.name,
      unit: values.unit,
      category: values.category || undefined,
      item_kind: config.itemKind,
      storage_type: values.storage_type as StorageType,
    });

    if (!result.success) {
      return { ...result, error: result.error ?? config.errorFallback };
    }

    const createdId = Number(
      (result.data as { id?: number | string } | null)?.id,
    );
    if (!Number.isFinite(createdId) || createdId <= 0) {
      return { success: false, error: config.readIdError };
    }

    onCreated?.(
      mapCreated({ id: createdId, name: values.name, unit: values.unit }),
    );
    return result;
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      schema={quickCreateSchema}
      defaultValues={defaultValues}
      entityKey={`${config.itemKind}-${config.categoryDefault}`}
      title={config.title}
      description={config.intro}
      submitLabel={config.submitLabel}
      successMessage={config.successMessage}
      contentClassName="sm:max-w-lg"
      onSubmit={handleSubmit}
    >
      {(form) => (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              control={form.control}
              name="name"
              label={config.nameLabel}
              placeholder={config.namePlaceholder}
              required
            />
            <TextField
              control={form.control}
              name="unit"
              label={config.unitLabel}
              placeholder={config.unitPlaceholder}
              required
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              control={form.control}
              name="category"
              label={config.categoryLabel}
              placeholder={config.categoryPlaceholder}
            />
            <SelectField
              control={form.control}
              name="storage_type"
              label={INVENTORY_VI.storageTypeLabel}
              options={STORAGE_OPTIONS}
            />
          </div>
        </>
      )}
    </FormDialog>
  );
}

const FINISHED_GOOD_CONFIG: QuickCreateDialogConfig = {
  title: INVENTORY_VI.quickFinishedGoodTitle,
  intro: INVENTORY_VI.quickFinishedGoodIntro,
  nameLabel: INVENTORY_VI.finishedGoodNameLabel,
  namePlaceholder: INVENTORY_VI.quickFinishedGoodNamePlaceholder,
  unitLabel: FORM_VI.unit,
  unitPlaceholder: INVENTORY_VI.quickFinishedGoodUnitPlaceholder,
  categoryLabel: FORM_VI.category,
  categoryDefault: INVENTORY_VI.quickFinishedGoodCategoryDefault,
  categoryPlaceholder: INVENTORY_VI.quickFinishedGoodCategoryDefault,
  itemKind: "finished_good",
  submitLabel: INVENTORY_VI.createFinishedGood,
  successMessage: INVENTORY_VI.quickFinishedGoodSuccess,
  errorFallback: INVENTORY_VI.quickFinishedGoodError,
  readIdError: INVENTORY_VI.quickFinishedGoodReadIdError,
};

const RAW_INGREDIENT_CONFIG: QuickCreateDialogConfig = {
  title: INVENTORY_VI.quickRawIngredientTitle,
  intro: INVENTORY_VI.quickRawIngredientIntro,
  nameLabel: INVENTORY_VI.rawIngredientNameLabel,
  namePlaceholder: INVENTORY_VI.quickRawIngredientNamePlaceholder,
  unitLabel: FORM_VI.unit,
  unitPlaceholder: INVENTORY_VI.quickRawIngredientUnitPlaceholder,
  categoryLabel: FORM_VI.category,
  categoryDefault: INVENTORY_VI.quickRawIngredientCategoryDefault,
  categoryPlaceholder: INVENTORY_VI.quickRawIngredientCategoryDefault,
  itemKind: "raw_material",
  submitLabel: INVENTORY_VI.createRawIngredient,
  successMessage: INVENTORY_VI.quickRawIngredientSuccess,
  errorFallback: INVENTORY_VI.quickRawIngredientError,
  readIdError: INVENTORY_VI.quickRawIngredientReadIdError,
};

interface QuickFinishedGoodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (good: FinishedGoodOption) => void;
}

export function QuickFinishedGoodDialog({
  open,
  onOpenChange,
  onCreated,
}: QuickFinishedGoodDialogProps) {
  return (
    <QuickCreateDialog<FinishedGoodOption>
      open={open}
      onOpenChange={onOpenChange}
      config={FINISHED_GOOD_CONFIG}
      onCreated={onCreated}
      mapCreated={({ id, name, unit }) => ({ id, name, unit })}
    />
  );
}

interface QuickRawIngredientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (ingredient: RawIngredientOption) => void;
}

export function QuickRawIngredientDialog({
  open,
  onOpenChange,
  onCreated,
}: QuickRawIngredientDialogProps) {
  return (
    <QuickCreateDialog<RawIngredientOption>
      open={open}
      onOpenChange={onOpenChange}
      config={RAW_INGREDIENT_CONFIG}
      onCreated={onCreated}
      mapCreated={({ id, name, unit }) => ({ id, name, unit })}
    />
  );
}
