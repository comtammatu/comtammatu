"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: existing KDS station form keeps operational copy inline until message-catalog extraction */

import { useMemo } from "react";
import { Controller } from "react-hook-form";
import { z } from "zod";
import { Label } from "@comtammatu/ui/components/label";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Frame } from "@comtammatu/ui/components/frame";
import { Switch } from "@comtammatu/ui/components/switch";
import { Field, FieldLabel } from "@comtammatu/ui/components/field";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { AppEmptyState } from "@/components/surface";
import { FormDialog, TextField, NumberField } from "@/components/form";
import { upsertStationWithCategories } from "./actions";
import type { CategoryOption, StationRow } from "./stations-client";

const stationSchema = z.object({
  name: z.string().trim().min(1, { error: "Tên trạm không được trống" }),
  position: z
    .string()
    .trim()
    .refine(
      (v) => {
        if (!v) return true;
        const n = Number(v);
        return Number.isFinite(n) && n >= 0;
      },
      { error: "Thứ tự phải ≥ 0" },
    ),
  is_active: z.boolean(),
  category_ids: z.array(z.number()),
});

type StationFormValues = z.infer<typeof stationSchema>;

function toFormValues(station: StationRow | null): StationFormValues {
  return {
    name: station?.name ?? "",
    position: station?.position != null ? String(station.position) : "0",
    is_active: station?.is_active ?? true,
    category_ids: station?.category_ids ?? [],
  };
}

interface StationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: number;
  station: StationRow | null;
  categories: CategoryOption[];
}

export function StationFormDialog({
  open,
  onOpenChange,
  branchId,
  station,
  categories,
}: StationFormDialogProps) {
  const isEdit = !!station;
  const defaultValues = useMemo(() => toFormValues(station), [station]);

  async function handleSubmit(values: StationFormValues) {
    return upsertStationWithCategories({
      id: isEdit && station ? station.id : undefined,
      branchId,
      name: values.name,
      position: values.position ? Number(values.position) : 0,
      isActive: isEdit ? values.is_active : true,
      categoryIds: values.category_ids,
    });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Chỉnh sửa trạm KDS" : "Thêm trạm KDS mới"}
      description={
        isEdit ? "Chỉnh sửa thông tin trạm KDS" : "Nhập thông tin trạm KDS mới"
      }
      schema={stationSchema}
      defaultValues={defaultValues}
      entityKey={station?.id ?? "new"}
      onSubmit={handleSubmit}
      successMessage={isEdit ? "Đã cập nhật trạm KDS" : "Đã tạo trạm KDS"}
      submitLabel={isEdit ? ACTIONS_VI.update : ACTIONS_VI.create}
      contentClassName="sm:max-w-lg"
    >
      {(form) => (
        <>
          <TextField
            control={form.control}
            name="name"
            label="Tên trạm"
            placeholder="VD: Bếp chính, Bếp phụ, Nước"
            required
          />

          <NumberField
            control={form.control}
            name="position"
            label="Thứ tự hiển thị"
            allowNegative={false}
          />

          {isEdit && (
            <Controller
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Switch
                    id="station-active"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <FieldLabel htmlFor="station-active">Hoạt động</FieldLabel>
                </Field>
              )}
            />
          )}

          <Controller
            control={form.control}
            name="category_ids"
            render={({ field }) => {
              const selected = new Set(field.value);
              const toggle = (id: number) => {
                if (selected.has(id)) {
                  field.onChange(field.value.filter((x) => x !== id));
                } else {
                  field.onChange([...field.value, id]);
                }
              };
              return (
                <div className="flex flex-col gap-2">
                  <Label>Danh mục món ăn</Label>
                  <p className="text-xs text-muted-foreground">
                    Chọn danh mục để trạm này tiếp nhận. Để trống = nhận tất cả
                    món (fallback).
                  </p>
                  <Frame className="flex max-h-48 flex-col gap-2 overflow-y-auto p-3">
                    {categories.map((cat) => (
                      <div key={cat.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`station-cat-${String(cat.id)}`}
                          checked={selected.has(cat.id)}
                          onCheckedChange={() => toggle(cat.id)}
                        />
                        <Label
                          htmlFor={`station-cat-${String(cat.id)}`}
                          className="cursor-pointer text-sm font-normal"
                        >
                          {cat.name}
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({cat.type})
                          </span>
                        </Label>
                      </div>
                    ))}
                    {categories.length === 0 && (
                      <AppEmptyState
                        className="border-0 bg-transparent"
                        title="Chưa có danh mục nào"
                        compact
                      />
                    )}
                  </Frame>
                </div>
              );
            }}
          />
        </>
      )}
    </FormDialog>
  );
}
