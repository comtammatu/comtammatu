"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleOff as IconCircleOff, Plus as IconPlus } from "lucide-react";
import {
  Controller,
  useFieldArray,
  type Control,
  type FieldErrors,
  type UseFormReturn,
} from "react-hook-form";
import { z } from "zod";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
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
import { Combobox, FormDialog } from "@/components/form";
import { toast } from "@comtammatu/ui/components/sonner";
import { FormattedNumberInput } from "./_components/formatted-number-input";
import { createProductionOrder } from "./production-actions";
import { defaultProductionNumber } from "./production-types";
import type { BranchOption, FinishedGoodOption } from "./production-types";
import type { ActionResult } from "@comtammatu/shared/types";

/* ─── Schema ─── */

import { ACTIONS_VI, BRANCH_VI, FORM_VI, INVENTORY_VI, PRODUCT_VI, TOAST_VI } from "@comtammatu/shared/messages";
const productionLineRowSchema = z.object({
  finished_good_id: z
    .string()
    .min(1, { error: INVENTORY_VI.selectFinishedGood })
    .refine((v) => Number(v) > 0, { error: "Thành phẩm không hợp lệ" }),
  quantity: z
    .string()
    .min(1, { error: INVENTORY_VI.enterQuantity })
    .refine((v) => Number(v) > 0, { error: INVENTORY_VI.quantityPositive }),
  unit: z.string().trim().min(1, { error: INVENTORY_VI.unitRequired }),
});

const productionOrderSchema = z.object({
  branch_id: z.string().min(1, { error: INVENTORY_VI.productionBranchRequired }),
  production_number: z
    .string()
    .trim()
    .min(1, { error: INVENTORY_VI.orderNumberRequired }),
  notes: z.string().optional(),
  lines: z
    .array(productionLineRowSchema)
    .min(1, { error: INVENTORY_VI.atLeastOneFinishedGood }),
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

function buildInitialValues(
  defaultBranchId: string,
  finishedGoodsOptions: FinishedGoodOption[],
): ProductionOrderFormValues {
  return {
    branch_id: defaultBranchId,
    production_number: defaultProductionNumber(),
    notes: "",
    lines: [buildEmptyRow(finishedGoodsOptions[0])],
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
    <div className="flex flex-col gap-1.5">
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
              placeholder={INVENTORY_VI.selectFinishedGood}
              searchPlaceholder={INVENTORY_VI.searchFinishedGood}
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
              placeholder={FORM_VI.quantity}
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
              placeholder={INVENTORY_VI.unitAbbrev}
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
          aria-label={INVENTORY_VI.removeRow}
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
  productionBranches: BranchOption[];
  finishedGoodsOptions: FinishedGoodOption[];
  actionsEnabled: boolean;
  triggerSize?: React.ComponentProps<typeof Button>["size"];
  triggerClassName?: string;
}

function ProductionOrderFields({
  form,
  productionBranches,
  finishedGoodsOptions,
  finishedGoodsMap,
}: {
  form: UseFormReturn<
    ProductionOrderFormValues,
    unknown,
    ProductionOrderFormValues
  >;
  productionBranches: BranchOption[];
  finishedGoodsOptions: FinishedGoodOption[];
  finishedGoodsMap: Map<number, FinishedGoodOption>;
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });
  const errors = form.formState.errors;
  const linesRootError = errors.lines?.root?.message ?? errors.lines?.message;

  function handleFinishedGoodChangeFactory(rowIndex: number) {
    return (value: string) => {
      const good = finishedGoodsMap.get(Number(value));
      if (good) {
        form.setValue(`lines.${rowIndex}.unit`, good.unit);
      }
    };
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="productionNumber">{INVENTORY_VI.productionNumber}</Label>
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
        <div className="flex flex-col gap-2">
          <Label htmlFor="branchId">{INVENTORY_VI.productionBranch}</Label>
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
                  <SelectValue placeholder={BRANCH_VI.select} />
                </SelectTrigger>
                <SelectContent>
                  {productionBranches.map((branch) => (
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

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">{FORM_VI.notes}</Label>
        <Controller
          control={form.control}
          name="notes"
          render={({ field }) => (
            <Textarea
              id="notes"
              {...field}
              value={field.value ?? ""}
              placeholder={INVENTORY_VI.productionNoteePlaceholder}
            />
          )}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label>{PRODUCT_VI.finishedGood}</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append(buildEmptyRow(finishedGoodsOptions[0]))}
          >
            {INVENTORY_VI.addRow}
          </Button>
        </div>

        <div className="flex flex-col gap-3">
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
    </>
  );
}

export function ProductionOrderForm({
  productionBranches,
  finishedGoodsOptions,
  actionsEnabled,
  triggerSize,
  triggerClassName,
}: ProductionOrderFormProps) {
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const defaultBranchId = productionBranches[0]?.id
    ? String(productionBranches[0].id)
    : "";
  const [formDefaults, setFormDefaults] = useState<ProductionOrderFormValues>(
    () => buildInitialValues(defaultBranchId, finishedGoodsOptions),
  );

  const finishedGoodsMap = useMemo(() => {
    const m = new Map<number, FinishedGoodOption>();
    for (const g of finishedGoodsOptions) m.set(g.id, g);
    return m;
  }, [finishedGoodsOptions]);

  function openCreateDialog() {
    setFormDefaults(buildInitialValues(defaultBranchId, finishedGoodsOptions));
    setIsDialogOpen(true);
  }

  async function submitProductionOrder(
    values: ProductionOrderFormValues,
  ): Promise<ActionResult> {
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
      return {
        success: false,
        error: INVENTORY_VI.atLeastOneFinishedGoodPeriod,
      };
    }

    const result = await createProductionOrder({
      branchId: Number(values.branch_id),
      productionNumber: values.production_number.trim(),
      notes: values.notes?.trim() || undefined,
      items: payloadLines,
    });

    if (!result.success && !result.error) {
      return {
        success: false,
        error: INVENTORY_VI.createProductionOrderFailed,
      };
    }

    return result;
  }

  function handleSuccess() {
    toast.success(TOAST_VI.productionOrderCreated);
    router.refresh();
  }

  return (
    <>
      <Button
        disabled={!actionsEnabled}
        onClick={openCreateDialog}
        size={triggerSize}
        className={triggerClassName}
      >
        <IconPlus className="mr-2 size-4" />
        {INVENTORY_VI.createProductionOrder}
      </Button>
      <FormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title={INVENTORY_VI.createProductionOrder}
        schema={productionOrderSchema}
        defaultValues={formDefaults}
        entityKey={formDefaults.production_number}
        onSubmit={submitProductionOrder}
        onSuccess={handleSuccess}
        submitLabel={INVENTORY_VI.createOrderShort}
        cancelLabel={ACTIONS_VI.cancel}
        contentClassName="sm:max-w-3xl"
      >
        {(form) => (
          <ProductionOrderFields
            form={form}
            productionBranches={productionBranches}
            finishedGoodsOptions={finishedGoodsOptions}
            finishedGoodsMap={finishedGoodsMap}
          />
        )}
      </FormDialog>
    </>
  );
}
