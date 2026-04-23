"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCircleOff, IconPlus } from "@tabler/icons-react";
import {
  Controller,
  useFieldArray,
  useForm,
  type Control,
  type FieldErrors,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@comtammatu/ui/components/dialog";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { Combobox } from "@/components/form";
import { toast } from "@comtammatu/ui/components/sonner";
import { FormattedNumberInput } from "./_components/formatted-number-input";
import { createProductionOrder } from "./production-actions";
import { defaultProductionNumber } from "./production-types";
import type { BranchOption, FinishedGoodOption } from "./production-types";

/* ─── Schema ─── */

const productionLineRowSchema = z.object({
  finished_good_id: z
    .string()
    .min(1, { error: "Chọn thành phẩm" })
    .refine((v) => Number(v) > 0, { error: "Thành phẩm không hợp lệ" }),
  quantity: z
    .string()
    .min(1, { error: "Nhập số lượng" })
    .refine((v) => Number(v) > 0, { error: "Số lượng phải > 0" }),
  unit: z.string().trim().min(1, { error: "Đơn vị không được trống" }),
});

const productionOrderSchema = z.object({
  branch_id: z
    .string()
    .min(1, { error: "Vui lòng chọn bếp trung tâm" }),
  production_number: z.string().trim().min(1, { error: "Số lệnh không được trống" }),
  notes: z.string().optional(),
  lines: z
    .array(productionLineRowSchema)
    .min(1, { error: "Cần ít nhất một thành phẩm hợp lệ" }),
});

type ProductionOrderFormValues = z.infer<typeof productionOrderSchema>;
type ProductionLineRow = z.infer<typeof productionLineRowSchema>;

function buildEmptyRow(fallback?: FinishedGoodOption): ProductionLineRow {
  return {
    finished_good_id: fallback?.id ? String(fallback.id) : "",
    quantity: "1",
    unit: fallback?.unit ?? "",
  };
}

/* ─── Row ─── */

function LineRowCells({
  control,
  index,
  finishedGoods,
  errors,
  onRemove,
  canRemove,
  onFinishedGoodChange,
}: {
  control: Control<ProductionOrderFormValues>;
  index: number;
  finishedGoods: FinishedGoodOption[];
  errors: FieldErrors<ProductionOrderFormValues>;
  onRemove: () => void;
  canRemove: boolean;
  onFinishedGoodChange: (value: string) => void;
}) {
  const rowError = errors.lines?.[index];

  return (
    <div className="space-y-1.5">
      <div className="grid gap-3 md:grid-cols-[1fr_120px_120px_auto]">
        <Controller
          control={control}
          name={`lines.${index}.finished_good_id`}
          render={({ field }) => (
            <Combobox
              value={field.value}
              onValueChange={(v) => {
                field.onChange(v);
                onFinishedGoodChange(v);
              }}
              options={finishedGoods.map((good) => ({
                value: String(good.id),
                label: good.name,
                hint: good.unit,
              }))}
              placeholder="Chọn thành phẩm"
              searchPlaceholder="Tìm thành phẩm..."
              aria-invalid={!!rowError?.finished_good_id}
              triggerClassName={cn(
                rowError?.finished_good_id && "border-destructive",
              )}
            />
          )}
        />

        <Controller
          control={control}
          name={`lines.${index}.quantity`}
          render={({ field }) => (
            <FormattedNumberInput
              value={field.value ?? ""}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
              name={field.name}
              maxFractionDigits={3}
              placeholder="Số lượng"
              aria-invalid={!!rowError?.quantity}
              className={cn(rowError?.quantity && "border-destructive")}
            />
          )}
        />

        <Controller
          control={control}
          name={`lines.${index}.unit`}
          render={({ field }) => (
            <Input
              {...field}
              value={field.value ?? ""}
              placeholder="ĐVT"
              aria-invalid={!!rowError?.unit}
              className={cn(rowError?.unit && "border-destructive")}
            />
          )}
        />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={!canRemove}
          className="self-start"
          aria-label="Xoá dòng"
        >
          <IconCircleOff className="size-4" />
        </Button>
      </div>
      {rowError && (
        <p className="text-xs text-destructive" role="alert">
          {rowError.finished_good_id?.message ??
            rowError.quantity?.message ??
            rowError.unit?.message}
        </p>
      )}
    </div>
  );
}

/* ─── Dialog ─── */

interface ProductionOrderFormProps {
  centralKitchenBranches: BranchOption[];
  finishedGoodsOptions: FinishedGoodOption[];
  actionsEnabled: boolean;
}

export function ProductionOrderForm({
  centralKitchenBranches,
  finishedGoodsOptions,
  actionsEnabled,
}: ProductionOrderFormProps) {
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const defaultBranchId = centralKitchenBranches[0]?.id
    ? String(centralKitchenBranches[0].id)
    : "";

  const initialValues = useMemo<ProductionOrderFormValues>(
    () => ({
      branch_id: defaultBranchId,
      production_number: defaultProductionNumber(),
      notes: "",
      lines: [buildEmptyRow(finishedGoodsOptions[0])],
    }),
    [defaultBranchId, finishedGoodsOptions],
  );

  const form = useForm<ProductionOrderFormValues, unknown, ProductionOrderFormValues>({
    resolver: zodResolver(productionOrderSchema),
    defaultValues: initialValues,
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  useEffect(() => {
    if (isDialogOpen) {
      form.reset({
        branch_id: defaultBranchId,
        production_number: defaultProductionNumber(),
        notes: "",
        lines: [buildEmptyRow(finishedGoodsOptions[0])],
      });
      setServerError(null);
    }
  }, [isDialogOpen, defaultBranchId, finishedGoodsOptions, form]);

  const finishedGoodsMap = useMemo(() => {
    const m = new Map<number, FinishedGoodOption>();
    for (const g of finishedGoodsOptions) m.set(g.id, g);
    return m;
  }, [finishedGoodsOptions]);

  function handleFinishedGoodChangeFactory(rowIndex: number) {
    return (value: string) => {
      const good = finishedGoodsMap.get(Number(value));
      if (good) {
        form.setValue(`lines.${rowIndex}.unit`, good.unit);
      }
    };
  }

  function onValid(values: ProductionOrderFormValues) {
    const payloadLines = values.lines
      .map((line) => ({
        finishedGoodId: Number(line.finished_good_id),
        quantity: Number(line.quantity),
        unit: line.unit.trim(),
      }))
      .filter(
        (line) =>
          Number.isFinite(line.finishedGoodId) &&
          line.finishedGoodId > 0 &&
          Number.isFinite(line.quantity) &&
          line.quantity > 0 &&
          line.unit.length > 0,
      );

    if (payloadLines.length === 0) {
      setServerError("Cần ít nhất một thành phẩm hợp lệ.");
      return;
    }

    startTransition(async () => {
      setServerError(null);
      const result = await createProductionOrder({
        branchId: Number(values.branch_id),
        productionNumber: values.production_number.trim(),
        notes: values.notes?.trim() || undefined,
        items: payloadLines,
      });
      if (!result.success) {
        setServerError(result.error ?? "Không thể tạo lệnh sản xuất");
        return;
      }
      toast.success("Đã tạo lệnh sản xuất");
      setIsDialogOpen(false);
      router.refresh();
    });
  }

  const errors = form.formState.errors;
  const linesRootError = errors.lines?.root?.message ?? errors.lines?.message;

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button disabled={!actionsEnabled}>
          <IconPlus className="mr-2 size-4" />
          Tạo lệnh sản xuất
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Tạo lệnh sản xuất</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onValid)} noValidate className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="productionNumber">Số lệnh</Label>
              <Controller
                control={form.control}
                name="production_number"
                render={({ field }) => (
                  <Input
                    id="productionNumber"
                    {...field}
                    value={field.value ?? ""}
                    placeholder="PRD-20260414-001"
                    aria-invalid={!!errors.production_number}
                    className={cn(
                      errors.production_number && "border-destructive",
                    )}
                  />
                )}
              />
              {errors.production_number && (
                <p className="text-xs text-destructive" role="alert">
                  {errors.production_number.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="branchId">Bếp trung tâm</Label>
              <Controller
                control={form.control}
                name="branch_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      id="branchId"
                      aria-invalid={!!errors.branch_id}
                      onBlur={field.onBlur}
                      ref={field.ref}
                    >
                      <SelectValue placeholder="Chọn bếp trung tâm" />
                    </SelectTrigger>
                    <SelectContent>
                      {centralKitchenBranches.map((branch) => (
                        <SelectItem key={branch.id} value={String(branch.id)}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.branch_id && (
                <p className="text-xs text-destructive" role="alert">
                  {errors.branch_id.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Ghi chú</Label>
            <Controller
              control={form.control}
              name="notes"
              render={({ field }) => (
                <Textarea
                  id="notes"
                  {...field}
                  value={field.value ?? ""}
                  placeholder="Ghi chú lô sản xuất, ca làm việc, yêu cầu đóng gói..."
                />
              )}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Thành phẩm</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append(buildEmptyRow(finishedGoodsOptions[0]))}
              >
                Thêm dòng
              </Button>
            </div>

            <div className="space-y-3">
              {fields.map((row, index) => (
                <LineRowCells
                  key={row.id}
                  control={form.control}
                  index={index}
                  finishedGoods={finishedGoodsOptions}
                  errors={errors}
                  onRemove={() => remove(index)}
                  canRemove={fields.length > 1}
                  onFinishedGoodChange={handleFinishedGoodChangeFactory(index)}
                />
              ))}
            </div>

            {linesRootError && (
              <p className="text-sm text-destructive" role="alert">
                {linesRootError}
              </p>
            )}
          </div>

          {serverError && (
            <p className="text-sm text-destructive" role="alert">
              {serverError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isPending}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={isPending || !actionsEnabled}>
              {isPending && <Spinner className="mr-2" />}
              Tạo lệnh
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
