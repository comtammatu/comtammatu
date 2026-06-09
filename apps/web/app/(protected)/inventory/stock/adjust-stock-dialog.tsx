"use client";

import { useEffect, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { Field, FieldGroup, FieldLabel } from "@comtammatu/ui/components/field";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import { QuantityField, TextareaField } from "@/components/form";
import { adjustStock } from "../stock-actions";
import { ACTIONS_VI, ERRORS_VI } from "@comtammatu/shared/messages";

type AdjustMode = "add" | "subtract" | "set";

const adjustStockSchema = z.object({
  mode: z.enum(["add", "subtract", "set"]),
  quantity: z
    .string()
    .trim()
    .min(1, { error: "Số lượng không được trống" })
    .refine(
      (v) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0;
      },
      { error: "Số lượng không hợp lệ" },
    ),
  reason: z.string().trim().optional(),
});

type AdjustStockFormValues = z.infer<typeof adjustStockSchema>;

const DEFAULT_VALUES: AdjustStockFormValues = {
  mode: "add",
  quantity: "",
  reason: "",
};

const MODE_LABEL: Record<AdjustMode, string> = {
  add: "Thêm",
  subtract: "Bớt",
  set: "Đặt",
};

function formatQty(value: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(
    value,
  );
}

interface AdjustStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: number;
  ingredientId: number;
  ingredientName: string;
  unit: string;
  currentStock: number;
  onAdjusted: () => void;
}

export function AdjustStockDialog({
  open,
  onOpenChange,
  branchId,
  ingredientId,
  ingredientName,
  unit,
  currentStock,
  onAdjusted,
}: AdjustStockDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<AdjustStockFormValues>({
    resolver: zodResolver(adjustStockSchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    if (open) {
      form.reset(DEFAULT_VALUES);
      setServerError(null);
    }
  }, [open, ingredientId, form]);

  const mode = form.watch("mode") as AdjustMode;
  const quantityStr = form.watch("quantity");
  const amount = Number(quantityStr);
  const hasValidAmount =
    quantityStr.trim() !== "" && Number.isFinite(amount) && amount >= 0;
  const resultStock = !hasValidAmount
    ? null
    : mode === "add"
      ? currentStock + amount
      : mode === "subtract"
        ? currentStock - amount
        : amount;

  function onValid(values: AdjustStockFormValues) {
    const qty = Number(values.quantity);

    let quantityChange: number;
    let type: "adjustment" | "count_adjustment";
    if (values.mode === "add") {
      quantityChange = qty;
      type = "adjustment";
    } else if (values.mode === "subtract") {
      quantityChange = -qty;
      type = "adjustment";
    } else {
      // "Đặt" = set on-hand to an absolute count → delta vs current.
      quantityChange = qty - currentStock;
      type = "count_adjustment";
    }

    if (quantityChange === 0) {
      setServerError("Tồn kho không thay đổi.");
      return;
    }

    startTransition(async () => {
      setServerError(null);
      const result = await adjustStock({
        branchId,
        ingredientId,
        quantityChange,
        type,
        reason: values.reason || undefined,
      });

      if (!result.success) {
        setServerError(result.error ?? ERRORS_VI.fallback);
        return;
      }

      const verb =
        values.mode === "add"
          ? `Đã thêm ${formatQty(qty)} ${unit}`
          : values.mode === "subtract"
            ? `Đã bớt ${formatQty(qty)} ${unit}`
            : `Đã đặt tồn = ${formatQty(qty)} ${unit}`;
      toast.success(`${verb} ${ingredientName}`);
      onOpenChange(false);
      onAdjusted();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" key={`adjust-${ingredientId}`}>
        <DialogHeader>
          <DialogTitle>Điều chỉnh tồn kho</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{ingredientName}</span>
            {" — tồn hiện tại "}
            <span className="font-medium text-foreground">
              {formatQty(currentStock)} {unit}
            </span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onValid)} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel>Thao tác</FieldLabel>
              <Controller
                control={form.control}
                name="mode"
                render={({ field }) => (
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={field.value}
                    onValueChange={(v) => {
                      if (v) field.onChange(v);
                    }}
                    className="justify-start"
                  >
                    <ToggleGroupItem value="add" className="px-4">
                      {MODE_LABEL.add}
                    </ToggleGroupItem>
                    <ToggleGroupItem value="subtract" className="px-4">
                      {MODE_LABEL.subtract}
                    </ToggleGroupItem>
                    <ToggleGroupItem value="set" className="px-4">
                      {MODE_LABEL.set}
                    </ToggleGroupItem>
                  </ToggleGroup>
                )}
              />
            </Field>

            <QuantityField
              control={form.control}
              name="quantity"
              label={
                mode === "set"
                  ? `Tồn thực đếm (${unit})`
                  : `Số lượng (${unit})`
              }
              placeholder="VD: 10"
              required
            />

            {resultStock !== null ? (
              <p className="text-sm text-muted-foreground">
                Tồn sau điều chỉnh:{" "}
                <span className="font-medium text-foreground">
                  {formatQty(resultStock)} {unit}
                </span>
              </p>
            ) : null}

            <TextareaField
              control={form.control}
              name="reason"
              label="Lý do (tùy chọn)"
              placeholder="VD: Nhập hàng sáng, Hao hụt, Kiểm kho..."
              rows={2}
            />

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
              {ACTIONS_VI.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner className="mr-2" />}
              Xác nhận
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
