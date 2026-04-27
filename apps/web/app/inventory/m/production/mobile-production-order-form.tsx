"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleOff as IconCircleOff, Plus as IconPlus } from "lucide-react";
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
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Combobox } from "@/components/form";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@comtammatu/ui/components/sheet";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { FormattedNumberInput } from "../../_components/formatted-number-input";
import { createProductionOrder } from "../../production-actions";
import { defaultProductionNumber } from "../../production-types";
import type {
  BranchOption,
  FinishedGoodOption,
} from "../../production-types";

/* ─── Schema ─── */

import { ACTIONS_VI } from "@comtammatu/shared/messages";
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

const mobileProductionSchema = z.object({
  branch_id: z.string().min(1, { error: "Vui lòng chọn bếp trung tâm" }),
  production_number: z
    .string()
    .trim()
    .min(1, { error: "Số lệnh không được trống" }),
  notes: z.string().optional(),
  lines: z
    .array(productionLineRowSchema)
    .min(1, { error: "Cần ít nhất một thành phẩm hợp lệ" }),
});

type MobileProductionFormValues = z.infer<typeof mobileProductionSchema>;
type ProductionLineRow = z.infer<typeof productionLineRowSchema>;

function buildEmptyRow(fallback?: FinishedGoodOption): ProductionLineRow {
  return {
    finished_good_id: fallback?.id ? String(fallback.id) : "",
    quantity: "1",
    unit: fallback?.unit ?? "",
  };
}

/* ─── Row (stacked for mobile) ─── */

function LineRowCard({
  control,
  index,
  finishedGoods,
  errors,
  onRemove,
  canRemove,
  onFinishedGoodChange,
}: {
  control: Control<MobileProductionFormValues>;
  index: number;
  finishedGoods: FinishedGoodOption[];
  errors: FieldErrors<MobileProductionFormValues>;
  onRemove: () => void;
  canRemove: boolean;
  onFinishedGoodChange: (value: string) => void;
}) {
  const rowError = errors.lines?.[index];

  return (
    <div className="space-y-3 rounded-xl border bg-card p-3">
      <div className="space-y-2">
        <Label>Thành phẩm</Label>
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
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Số lượng</Label>
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
        </div>
        <div className="space-y-2">
          <Label>Đơn vị</Label>
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
        </div>
      </div>

      {rowError && (
        <p className="text-xs text-destructive" role="alert">
          {rowError.finished_good_id?.message ??
            rowError.quantity?.message ??
            rowError.unit?.message}
        </p>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={!canRemove}
        >
          <IconCircleOff className="mr-2 size-4" />
          Bỏ dòng
        </Button>
      </div>
    </div>
  );
}

/* ─── Form ─── */

interface MobileProductionOrderFormProps {
  centralKitchenBranches: BranchOption[];
  finishedGoodsOptions: FinishedGoodOption[];
  actionsEnabled: boolean;
}

export function MobileProductionOrderForm({
  centralKitchenBranches,
  finishedGoodsOptions,
  actionsEnabled,
}: MobileProductionOrderFormProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const defaultBranchId = centralKitchenBranches[0]?.id
    ? String(centralKitchenBranches[0].id)
    : "";

  const initialValues = useMemo<MobileProductionFormValues>(
    () => ({
      branch_id: defaultBranchId,
      production_number: defaultProductionNumber(),
      notes: "",
      lines: [buildEmptyRow(finishedGoodsOptions[0])],
    }),
    [defaultBranchId, finishedGoodsOptions],
  );

  const form = useForm<
    MobileProductionFormValues,
    unknown,
    MobileProductionFormValues
  >({
    resolver: zodResolver(mobileProductionSchema),
    defaultValues: initialValues,
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        branch_id: defaultBranchId,
        production_number: defaultProductionNumber(),
        notes: "",
        lines: [buildEmptyRow(finishedGoodsOptions[0])],
      });
      setServerError(null);
    }
  }, [isOpen, defaultBranchId, finishedGoodsOptions, form]);

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

  function onValid(values: MobileProductionFormValues) {
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
      setIsOpen(false);
      router.refresh();
    });
  }

  const errors = form.formState.errors;
  const linesRootError = errors.lines?.root?.message ?? errors.lines?.message;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button disabled={!actionsEnabled}>
          <IconPlus className="mr-2 size-4" />
          Tạo lệnh sản xuất
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-screen overflow-y-auto">
        <SheetHeader className="border-b px-4 py-4">
          <SheetTitle>Tạo lệnh sản xuất</SheetTitle>
          <SheetDescription>
            Nhập thành phẩm cần làm ngay trong ca hiện tại.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onValid)} noValidate>
          <div className="space-y-4 px-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="mobile-production-number">Số lệnh</Label>
              <Controller
                control={form.control}
                name="production_number"
                render={({ field }) => (
                  <Input
                    id="mobile-production-number"
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
              <Label htmlFor="mobile-production-branch">Bếp trung tâm</Label>
              <Controller
                control={form.control}
                name="branch_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      id="mobile-production-branch"
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

            <div className="space-y-2">
              <Label htmlFor="mobile-production-notes">Ghi chú</Label>
              <Controller
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <Textarea
                    id="mobile-production-notes"
                    {...field}
                    value={field.value ?? ""}
                    placeholder="Ca làm việc, đóng gói, ghi chú bàn giao..."
                  />
                )}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
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
                  <LineRowCard
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

            {serverError ? (
              <p className="text-sm text-destructive" role="alert">
                {serverError}
              </p>
            ) : null}
          </div>

          <SheetFooter className="border-t px-4 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isPending}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button type="submit" disabled={isPending || !actionsEnabled}>
              {isPending ? <Spinner className="mr-2" /> : null}
              Tạo lệnh
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
