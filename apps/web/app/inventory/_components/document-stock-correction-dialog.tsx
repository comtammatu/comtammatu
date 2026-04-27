"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal as IconSliders } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@comtammatu/ui/components/dialog";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { FormattedNumberInput } from "./formatted-number-input";
import {
  createInventoryDocumentCorrection,
  type InventoryCorrectionDocumentType,
} from "../document-correction-actions";

import { ACTIONS_VI, BRANCH_VI } from "@comtammatu/shared/messages";
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

function formatQuantity(value: number, unit: string) {
  return `${value.toLocaleString("vi-VN", {
    maximumFractionDigits: 3,
  })} ${unit}`.trim();
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
  const [isPending, startTransition] = useTransition();
  const items = useMemo(() => uniqueItems(itemOptions), [itemOptions]);
  const [branchId, setBranchId] = useState("");
  const [ingredientId, setIngredientId] = useState("");
  const [quantityChange, setQuantityChange] = useState("");
  const [reason, setReason] = useState("");
  const selectedItem = items.find(
    (item) => item.ingredientId === Number(ingredientId),
  );

  useEffect(() => {
    if (!open) return;
    setBranchId(branchOptions[0] ? String(branchOptions[0].id) : "");
    setIngredientId(items[0] ? String(items[0].ingredientId) : "");
    setQuantityChange("");
    setReason("");
  }, [branchOptions, items, open]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedBranchId = Number(branchId);
    const parsedIngredientId = Number(ingredientId);
    const parsedQuantity = Number(quantityChange);
    const trimmedReason = reason.trim();

    if (!parsedBranchId) {
      toast.error("Chọn chi nhánh/kho cần điều chỉnh.");
      return;
    }
    if (!parsedIngredientId) {
      toast.error("Chọn mặt hàng cần điều chỉnh.");
      return;
    }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity === 0) {
      toast.error("Số lượng điều chỉnh phải khác 0.");
      return;
    }
    if (trimmedReason.length < 10) {
      toast.error("Nhập lý do điều chỉnh ít nhất 10 ký tự.");
      return;
    }

    startTransition(async () => {
      const result = await createInventoryDocumentCorrection({
        documentType,
        documentId,
        branchId: parsedBranchId,
        ingredientId: parsedIngredientId,
        quantityChange: parsedQuantity,
        reason: trimmedReason,
      });

      if (!result.success) {
        toast.error(result.error ?? "Không thể tạo điều chỉnh tồn kho.");
        return;
      }

      toast.success(
        `Đã điều chỉnh ${formatQuantity(parsedQuantity, selectedItem?.unit ?? "")}`,
      );
      setOpen(false);
      router.refresh();
    });
  }

  const disabled = branchOptions.length === 0 || items.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={buttonVariant}
          size={buttonSize}
          disabled={disabled}
        >
          <IconSliders className="size-4" />
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Điều chỉnh tồn kho</DialogTitle>
          <DialogDescription>
            Tạo bút toán điều chỉnh cho {documentCode}; chứng từ gốc không bị
            sửa trực tiếp.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Chi nhánh/kho</Label>
              <Select
                value={branchId}
                onValueChange={setBranchId}
                disabled={branchOptions.length <= 1}
              >
                <SelectTrigger>
                  <SelectValue placeholder={BRANCH_VI.select} />
                </SelectTrigger>
                <SelectContent>
                  {branchOptions.map((branch) => (
                    <SelectItem key={branch.id} value={String(branch.id)}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Mặt hàng</Label>
              <Select value={ingredientId} onValueChange={setIngredientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn mặt hàng" />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem
                      key={item.ingredientId}
                      value={String(item.ingredientId)}
                    >
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`correction-qty-${documentType}-${documentId}`}>
              Số lượng delta ({selectedItem?.unit ?? "đơn vị"}) - dương = nhập,
              âm = xuất
            </Label>
            <FormattedNumberInput
              id={`correction-qty-${documentType}-${documentId}`}
              value={quantityChange}
              onValueChange={setQuantityChange}
              allowNegative
              maxFractionDigits={3}
              placeholder="VD: 10 hoặc -5"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`correction-reason-${documentType}-${documentId}`}>
              Lý do điều chỉnh *
            </Label>
            <Textarea
              id={`correction-reason-${documentType}-${documentId}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              maxLength={500}
              placeholder="VD: Nhân viên nhập sai số lượng thực nhận, điều chỉnh sau kiểm tra ca tối..."
              required
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Spinner className="mr-2" /> : null}
              Ghi điều chỉnh
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
