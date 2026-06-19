"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { SlidersHorizontal as IconSliders } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  FormDialog,
  NumberField,
  SelectField,
  TextareaField,
} from "@/components/form";
import {
  createInventoryDocumentCorrection,
  type InventoryCorrectionDocumentType,
} from "../document-correction-actions";

import { ACTIONS_VI, BRANCH_VI, PRODUCT_VI } from "@comtammatu/shared/messages";

const documentCorrectionSchema = z.object({
  branchId: z.string().min(1, {
    error: "Chọn chi nhánh/kho cần điều chỉnh.",
  }),
  ingredientId: z.string().min(1, {
    error: "Chọn mặt hàng cần điều chỉnh.",
  }),
  quantityChange: z.string().refine(
    (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed !== 0;
    },
    { error: "Số lượng điều chỉnh phải khác 0." },
  ),
  reason: z
    .string()
    .trim()
    .min(10, { error: "Nhập lý do điều chỉnh ít nhất 10 ký tự." }),
});

type DocumentCorrectionValues = z.infer<typeof documentCorrectionSchema>;

const documentCorrectionCopy = {
  itemPlaceholder: "Chọn mặt hàng",
  quantityPlaceholder: "VD: 10 hoặc -5",
  reasonPlaceholder:
    "VD: Nhân viên nhập sai số lượng thực nhận, điều chỉnh sau kiểm tra ca tối...",
};

export type CorrectionBranchOption = {
  id: number;
  name: string;
};

export type CorrectionItemOption = {
  ingredientId: number;
  name: string;
  unit: string;
};

type DocumentStockCorrectionDialogProps = {
  documentType: InventoryCorrectionDocumentType;
  documentId: number;
  documentCode: string;
  branchOptions: CorrectionBranchOption[];
  itemOptions: CorrectionItemOption[];
  buttonLabel?: string;
  buttonVariant?: "default" | "outline" | "secondary" | "ghost";
  buttonSize?: "default" | "sm";
};

function uniqueItems(items: CorrectionItemOption[]) {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (seen.has(item.ingredientId)) return false;
    seen.add(item.ingredientId);
    return true;
  });
}

export function DocumentStockCorrectionDialog({
  documentType,
  documentId,
  documentCode,
  branchOptions,
  itemOptions,
  buttonLabel = "Điều chỉnh tồn",
  buttonVariant = "outline",
  buttonSize = "default",
}: DocumentStockCorrectionDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const items = useMemo(() => uniqueItems(itemOptions), [itemOptions]);
  const defaultValues = useMemo<DocumentCorrectionValues>(
    () => ({
      branchId: branchOptions[0] ? String(branchOptions[0].id) : "",
      ingredientId: items[0] ? String(items[0].ingredientId) : "",
      quantityChange: "",
      reason: "",
    }),
    [branchOptions, items],
  );

  const branchSelectOptions = useMemo(
    () =>
      branchOptions.map((branch) => ({
        value: String(branch.id),
        label: branch.name,
      })),
    [branchOptions],
  );
  const itemSelectOptions = useMemo(
    () =>
      items.map((item) => ({
        value: String(item.ingredientId),
        label: item.name,
      })),
    [items],
  );

  async function handleSubmit(values: DocumentCorrectionValues) {
    const result = await createInventoryDocumentCorrection({
      documentType,
      documentId,
      branchId: Number(values.branchId),
      ingredientId: Number(values.ingredientId),
      quantityChange: Number(values.quantityChange),
      reason: values.reason.trim(),
    });

    if (result.success) {
      router.refresh();
    }
    return result;
  }

  const disabled = branchOptions.length === 0 || items.length === 0;

  return (
    <>
      <Button
        type="button"
        variant={buttonVariant}
        size={buttonSize}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <IconSliders className="size-4" />
        {buttonLabel}
      </Button>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={`Điều chỉnh tồn — ${documentCode}`}
        schema={documentCorrectionSchema}
        defaultValues={defaultValues}
        entityKey={`${documentType}-${documentId}`}
        onSubmit={handleSubmit}
        successMessage={`Đã tạo điều chỉnh tồn cho ${documentCode}`}
        submitLabel="Ghi điều chỉnh"
        cancelLabel={ACTIONS_VI.cancel}
        contentClassName="sm:max-w-lg"
      >
        {(form) => {
          const selectedItem = items.find(
            (item) => item.ingredientId === Number(form.watch("ingredientId")),
          );
          return (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  control={form.control}
                  name="branchId"
                  label="Chi nhánh/kho"
                  options={branchSelectOptions}
                  placeholder={BRANCH_VI.select}
                  disabled={branchOptions.length <= 1}
                  required
                />
                <SelectField
                  control={form.control}
                  name="ingredientId"
                  label={PRODUCT_VI.inventoryItem}
                  options={itemSelectOptions}
                  placeholder={documentCorrectionCopy.itemPlaceholder}
                  required
                />
              </div>

              <NumberField
                control={form.control}
                name="quantityChange"
                label={`Số lượng delta (${selectedItem?.unit ?? "đơn vị"}) - dương = nhập, âm = xuất`}
                allowNegative
                maxFractionDigits={3}
                placeholder={documentCorrectionCopy.quantityPlaceholder}
                required
              />

              <TextareaField
                control={form.control}
                name="reason"
                label="Lý do điều chỉnh"
                rows={4}
                maxLength={500}
                placeholder={documentCorrectionCopy.reasonPlaceholder}
                required
              />
            </>
          );
        }}
      </FormDialog>
    </>
  );
}
