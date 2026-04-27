"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { FieldGroup } from "@comtammatu/ui/components/field";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { SelectField, TextField } from "@/components/form";
import { createIngredient } from "./actions";
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
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<QuickCreateFormValues>({
    resolver: zodResolver(quickCreateSchema),
    defaultValues: {
      name: "",
      unit: "",
      category: config.categoryDefault,
      storage_type: "ambient",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: "",
        unit: "",
        category: config.categoryDefault,
        storage_type: "ambient",
      });
      setServerError(null);
    }
  }, [open, config.categoryDefault, form]);

  function onValid(values: QuickCreateFormValues) {
    startTransition(async () => {
      setServerError(null);
      const result = await createIngredient({
        name: values.name,
        purchase_unit: values.unit,
        measure_unit: values.unit,
        purchase_to_measure_factor: 1,
        category: values.category || undefined,
        item_kind: config.itemKind,
        storage_type: values.storage_type as StorageType,
        min_stock_level: 0,
      });

      if (!result.success) {
        setServerError(result.error ?? config.errorFallback);
        return;
      }

      const createdId = Number(
        (result.data as { id?: number | string } | null)?.id,
      );
      if (!Number.isFinite(createdId) || createdId <= 0) {
        setServerError(config.readIdError);
        return;
      }

      onCreated?.(
        mapCreated({ id: createdId, name: values.name, unit: values.unit }),
      );
      toast.success(config.successMessage);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onValid)} noValidate>
          <FieldGroup>
            <p className="text-sm text-muted-foreground">{config.intro}</p>

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
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner className="mr-2" />}
              {config.submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  categoryDefault: "Bếp trung tâm",
  categoryPlaceholder: "Bếp trung tâm",
  itemKind: "finished_good",
  submitLabel: "Tạo thành phẩm",
  successMessage: "Đã thêm thành phẩm mới",
  errorFallback: "Không thể tạo thành phẩm",
  readIdError: "Đã tạo thành phẩm nhưng không đọc được mã mới.",
};

const RAW_INGREDIENT_CONFIG: QuickCreateDialogConfig = {
  title: "Thêm nguyên liệu mới",
  intro:
    "Tạo nhanh nguyên liệu đầu vào để hòan thiện BOM và chuẩn bị cho lệnh sản xuất.",
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
