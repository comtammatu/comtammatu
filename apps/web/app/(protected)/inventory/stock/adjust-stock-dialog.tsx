"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
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
import { FieldGroup } from "@comtammatu/ui/components/field";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { NumberField, SelectField, TextareaField } from "@/components/form";
import { adjustStock } from "../stock-actions";
import { ACTIONS_VI, ERRORS_VI } from "@comtammatu/shared/messages";

const ADJUST_TYPE_OPTIONS = [
  { value: "adjustment", label: "Điều chỉnh thủ công" },
  { value: "count_adjustment", label: "Kiểm kho" },
] as const;

const adjustStockSchema = z.object({
  adjust_type: z.enum(["adjustment", "count_adjustment"]),
  quantity_change: z
    .string()
    .trim()
    .min(1, { error: "Số lượng điều chỉnh không được trống" })
    .refine(
      (v) => {
        const n = Number(v);
        return Number.isFinite(n) && n !== 0;
      },
      { error: "Số lượng điều chỉnh không được bằng 0" },
    ),
  reason: z.string().trim().optional(),
});

type AdjustStockFormValues = z.infer<typeof adjustStockSchema>;

const DEFAULT_VALUES: AdjustStockFormValues = {
  adjust_type: "adjustment",
  quantity_change: "",
  reason: "",
};

interface AdjustStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: number;
  ingredientId: number;
  ingredientName: string;
  unit: string;
  onAdjusted: () => void;
}

export function AdjustStockDialog({
  open,
  onOpenChange,
  branchId,
  ingredientId,
  ingredientName,
  unit,
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

  function onValid(values: AdjustStockFormValues) {
    const parsedQuantityChange = Number(values.quantity_change);

    startTransition(async () => {
      setServerError(null);
      const result = await adjustStock({
        branchId,
        ingredientId,
        quantityChange: parsedQuantityChange,
        type: values.adjust_type,
        reason: values.reason || undefined,
      });

      if (!result.success) {
        setServerError(result.error ?? ERRORS_VI.fallback);
        return;
      }

      toast.success(
        parsedQuantityChange > 0
          ? `Đã nhập ${parsedQuantityChange} ${unit} ${ingredientName}`
          : `Đã xuất ${Math.abs(parsedQuantityChange)} ${unit} ${ingredientName}`,
      );
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
            Nguyên liệu:{" "}
            <span className="font-medium text-foreground">
              {ingredientName}
            </span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onValid)} noValidate>
          <FieldGroup>
            <SelectField
              control={form.control}
              name="adjust_type"
              label="Loại điều chỉnh"
              options={ADJUST_TYPE_OPTIONS}
            />

            <NumberField
              control={form.control}
              name="quantity_change"
              label={`Số lượng (${unit}) — dương = nhập, âm = xuất`}
              allowNegative
              maxFractionDigits={2}
              placeholder="VD: 10 hoặc -5"
              required
            />

            <TextareaField
              control={form.control}
              name="reason"
              label="Lý do (tùy chọn)"
              placeholder="VD: Nhập hàng sáng, Hao hụt..."
              rows={3}
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
