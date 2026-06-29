"use client";

import { z } from "zod";
import { FormDialog, SelectField, TextField } from "@/components/form";
import { quickCreateIngredient } from "./ingredient-actions";
import type {
  FinishedGoodOption,
  RawIngredientOption,
} from "./production-types";
import { STORAGE_OPTIONS } from "./_lib/constants";

type StorageType = "ambient" | "refrigerated" | "frozen";

const quickCreateSchema = z.object({
  name: z.string().trim().min(1, { error: "Tên không được trống" }),
  unit: z.string().trim().min(1, { error: "Đơn vị không được trống" }),
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
              label="Kiểu lưu trữ"
              options={STORAGE_OPTIONS}
            />
          </div>
        </>
      )}
    </FormDialog>
  );
}

const FINISHED_GOOD_CONFIG: QuickCreateDialogConfig = {
  title: "Thêm thành phẩm mới",
  intro:
    "Danh sách trong BOM sản xuất lấy từ danh mục nguyên liệu có loại Thành phẩm. Tạo mới ở đây để dùng ngay cho công thức.",
  nameLabel: "Tên thành phẩm",
  namePlaceholder: "VD: Sườn nướng sơ chế",
  unitLabel: "Đơn vị",
  unitPlaceholder: "khay, kg, lít...",
  categoryLabel: "Danh mục",
  categoryDefault: "Sản xuất",
  categoryPlaceholder: "Sản xuất",
  itemKind: "finished_good",
  submitLabel: "Tạo thành phẩm",
  successMessage: "Đã thêm thành phẩm mới",
  errorFallback: "Không thể tạo thành phẩm",
  readIdError: "Đã tạo thành phẩm nhưng không đọc được mã mới.",
};

const RAW_INGREDIENT_CONFIG: QuickCreateDialogConfig = {
  title: "Thêm nguyên liệu mới",
  intro:
    "Tạo nhanh nguyên liệu đầu vào để hoàn thiện BOM và chuẩn bị cho lệnh sản xuất.",
  nameLabel: "Tên nguyên liệu",
  namePlaceholder: "VD: Nước mắm pha",
  unitLabel: "Đơn vị",
  unitPlaceholder: "kg, lít, chai...",
  categoryLabel: "Danh mục",
  categoryDefault: "Nguyên liệu sản xuất",
  categoryPlaceholder: "Nguyên liệu sản xuất",
  itemKind: "raw_material",
  submitLabel: "Tạo nguyên liệu",
  successMessage: "Đã thêm nguyên liệu mới",
  errorFallback: "Không thể tạo nguyên liệu",
  readIdError: "Đã tạo nguyên liệu nhưng không đọc được mã mới.",
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
