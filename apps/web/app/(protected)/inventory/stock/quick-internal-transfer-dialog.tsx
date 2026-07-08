/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import { useMemo } from "react";
import { z } from "zod";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { formatCount } from "@comtammatu/shared/format";
import {
  FormDialog,
  NumberField,
  SelectField,
  TextareaField,
} from "@/components/form";
import { quickInternalTransfer } from "../transfer-actions";
import {
  getIssueBaseQuantity,
  getIssueMaxEntryQuantity,
  getIssueUnitOptions,
  getDefaultIssueUnit,
  type IssueUnitOption,
} from "../_lib/issue-units";
import type { StockIngredient } from "./stock-client";

function createQuickTransferSchema(
  maxBaseQuantity: number,
  issueUnitOptions: IssueUnitOption[],
) {
  return z
    .object({
      quantity: z.string().refine((value) => Number(value) > 0, {
        error: "Số lượng phải lớn hơn 0",
      }),
      entryUnitId: z.string().optional(),
      reason: z.string().trim().optional(),
    })
    .refine(
      (value) => {
        const issueUnit = issueUnitOptions.find(
          (option) => String(option.unitId) === value.entryUnitId,
        );
        return (
          getIssueBaseQuantity(Number(value.quantity), issueUnit) <=
          maxBaseQuantity + 1e-9
        );
      },
      {
        path: ["quantity"],
        error: "Số lượng vượt quá tồn kho",
      },
    );
}

type QuickTransferFormValues = z.infer<ReturnType<typeof createQuickTransferSchema>>;

export function QuickInternalTransferDialog({
  branchId,
  open,
  target,
  onOpenChange,
}: QuickInternalTransferDialogProps) {
  const issueUnitOptions = useMemo(
    () => getIssueUnitOptions(target),
    [target],
  );
  const defaultIssueUnit = useMemo(
    () => getDefaultIssueUnit(target),
    [target],
  );
  const schema = useMemo(
    () => createQuickTransferSchema(target.qty, issueUnitOptions),
    [issueUnitOptions, target.qty],
  );
  const defaultValues = useMemo<QuickTransferFormValues>(
    () => ({
      quantity: "",
      entryUnitId: defaultIssueUnit ? String(defaultIssueUnit.unitId) : "",
      reason: "",
    }),
    [defaultIssueUnit],
  );

  async function handleSubmit(values: QuickTransferFormValues) {
    const selectedIssueUnit = issueUnitOptions.find(
      (option) => String(option.unitId) === values.entryUnitId,
    );
    const result = await quickInternalTransfer({
      branchId,
      ingredientId: target.id,
      quantity: Number(values.quantity),
      entryUnitId: selectedIssueUnit?.unitId ?? null,
      reason: values.reason,
    });
    return result;
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Chuyển xuống Bếp: ${target.name}`}
      schema={schema}
      defaultValues={defaultValues}
      entityKey={`transfer-${target.id}`}
      onSubmit={handleSubmit}
      successMessage={`Đã chuyển ${target.name} xuống Bếp.`}
      submitLabel="Xác nhận chuyển"
      cancelLabel={ACTIONS_VI.cancel}
      contentClassName="sm:max-w-md"
    >
      {(form) => {
        const quantityError = form.formState.errors.quantity;
        const entryUnitId = form.watch("entryUnitId");
        const selectedIssueUnit = issueUnitOptions.find(
          (option) => String(option.unitId) === entryUnitId,
        );
        const maxEntryQuantity = getIssueMaxEntryQuantity(
          target.qty,
          selectedIssueUnit,
        );

        return (
          <>
            <div className="flex gap-2">
              <div className="flex-1">
                <NumberField
                  control={form.control}
                  name="quantity"
                  label="Số lượng"
                  placeholder="0"
                  maxFractionDigits={3}
                  required
                />
              </div>
              <div className="w-1/3">
                <SelectField
                  control={form.control}
                  name="entryUnitId"
                  label="Đơn vị"
                  options={issueUnitOptions.map((o) => ({
                    value: String(o.unitId),
                    label: o.label,
                  }))}
                  disabled={issueUnitOptions.length <= 1}
                />
              </div>
            </div>

            {maxEntryQuantity !== null && !quantityError && (
              <p className="text-xs text-muted-foreground mt-[-0.5rem]">
                Có thể chuyển tối đa {formatCount(maxEntryQuantity)}{" "}
                {selectedIssueUnit?.label ?? target.unit}.
              </p>
            )}

            <TextareaField
              control={form.control}
              name="reason"
              label="Ghi chú (tuỳ chọn)"
              placeholder="VD: Bổ sung gấp cho bếp..."
              rows={2}
            />
          </>
        );
      }}
    </FormDialog>
  );
}

export interface QuickInternalTransferDialogProps {
  branchId: number;
  open: boolean;
  target: StockIngredient;
  onOpenChange: (open: boolean) => void;
}
