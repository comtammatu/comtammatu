"use client";

import { useEffect, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Label } from "@comtammatu/ui/components/label";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Switch } from "@comtammatu/ui/components/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { Field, FieldGroup, FieldLabel } from "@comtammatu/ui/components/field";
import { toast } from "@comtammatu/ui/components/sonner";
import { ACTIONS_VI, ERRORS_VI } from "@comtammatu/shared/messages";
import { AppEmptyState } from "@/components/surface";
import { TextField, valuesToFormData } from "@/components/form";
import { createStation, saveStationCategories, updateStation } from "./actions";
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
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<StationFormValues, unknown, StationFormValues>({
    resolver: zodResolver(stationSchema),
    defaultValues: toFormValues(station),
  });

  useEffect(() => {
    if (open) {
      form.reset(toFormValues(station));
      setServerError(null);
    }
  }, [open, station, form]);

  function onValid(values: StationFormValues) {
    startTransition(async () => {
      setServerError(null);

      const payload: Record<string, unknown> = {
        name: values.name,
        position: values.position || "0",
      };
      if (isEdit) {
        payload.is_active = values.is_active;
      }
      const fd = valuesToFormData(payload);
      fd.set("branch_id", String(branchId));
      if (isEdit && station) {
        fd.set("id", String(station.id));
      }

      const mainResult = isEdit
        ? await updateStation(null, fd)
        : await createStation(null, fd);

      if (!mainResult.success) {
        setServerError(mainResult.error ?? ERRORS_VI.fallback);
        return;
      }

      const stationId = isEdit
        ? station?.id
        : (mainResult.data as { id: number } | undefined)?.id;

      if (stationId) {
        const catResult = await saveStationCategories({
          stationId,
          categoryIds: values.category_ids,
        });
        if (!catResult.success) {
          toast.error(catResult.error ?? "Không thể lưu danh mục");
          return;
        }
      }

      onOpenChange(false);
      toast.success(isEdit ? "Đã cập nhật trạm KDS" : "Đã tạo trạm KDS");
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Chỉnh sửa trạm KDS" : "Thêm trạm KDS mới"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit
              ? "Chỉnh sửa thông tin trạm KDS"
              : "Nhập thông tin trạm KDS mới"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onValid)} noValidate>
          <FieldGroup>
            <TextField
              control={form.control}
              name="name"
              label="Tên trạm"
              placeholder="VD: Bếp chính, Bếp phụ, Nước"
              required
            />

            <TextField
              control={form.control}
              name="position"
              label="Thứ tự hiển thị"
              type="number"
              min={0}
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
                  <div className="space-y-2">
                    <Label>Danh mục món ăn</Label>
                    <p className="text-xs text-muted-foreground">
                      Chọn danh mục để trạm này tiếp nhận. Để trống = nhận tất
                      cả món (fallback).
                    </p>
                    <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
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
                          className="border-0 bg-transparent py-6"
                          title="Chưa có danh mục nào"
                          compact
                        />
                      )}
                    </div>
                  </div>
                );
              }}
            />

            {serverError && (
              <p className="text-sm text-destructive" role="alert">
                {serverError}
              </p>
            )}
          </FieldGroup>

          <DialogFooter spacing="form">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner className="mr-2" />}
              {isEdit ? ACTIONS_VI.update : ACTIONS_VI.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
