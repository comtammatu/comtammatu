"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleSlash, Plus } from "lucide-react";
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
  DraftLine,
  FinishedGoodOption,
} from "../../production-types";

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
  const [createError, setCreateError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState(
    centralKitchenBranches[0]?.id ? String(centralKitchenBranches[0].id) : "",
  );
  const [productionNumber, setProductionNumber] = useState(
    defaultProductionNumber(),
  );
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    {
      finishedGoodId: finishedGoodsOptions[0]?.id ?? 0,
      quantity: "1",
      unit: finishedGoodsOptions[0]?.unit ?? "",
    },
  ]);

  useEffect(() => {
    if (!isOpen) return;
    if (!branchId && centralKitchenBranches[0]) {
      setBranchId(String(centralKitchenBranches[0].id));
    }
    if (lines.length === 0 && finishedGoodsOptions[0]) {
      setLines([
        {
          finishedGoodId: finishedGoodsOptions[0].id,
          quantity: "1",
          unit: finishedGoodsOptions[0].unit,
        },
      ]);
    }
  }, [
    branchId,
    centralKitchenBranches,
    finishedGoodsOptions,
    isOpen,
    lines.length,
  ]);

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    );
  }

  function addLine() {
    const fallback = finishedGoodsOptions[0];
    setLines((prev) => [
      ...prev,
      {
        finishedGoodId: fallback?.id ?? 0,
        quantity: "1",
        unit: fallback?.unit ?? "",
      },
    ]);
  }

  function removeLine(index: number) {
    setLines((prev) =>
      prev.length <= 1
        ? prev
        : prev.filter((_, lineIndex) => lineIndex !== index),
    );
  }

  function resetForm() {
    setCreateError(null);
    setProductionNumber(defaultProductionNumber());
    setNotes("");
    setLines([
      {
        finishedGoodId: finishedGoodsOptions[0]?.id ?? 0,
        quantity: "1",
        unit: finishedGoodsOptions[0]?.unit ?? "",
      },
    ]);
    if (centralKitchenBranches[0]) {
      setBranchId(String(centralKitchenBranches[0].id));
    }
  }

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (!open) {
      resetForm();
    }
  }

  function handleCreate() {
    const parsedBranchId = Number(branchId);
    const payloadLines = lines
      .map((line) => ({
        finishedGoodId: line.finishedGoodId,
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
      setCreateError("Cần ít nhất một thành phẩm hợp lệ.");
      return;
    }

    startTransition(async () => {
      setCreateError(null);
      const result = await createProductionOrder({
        branchId: parsedBranchId,
        productionNumber: productionNumber.trim(),
        notes: notes.trim() || undefined,
        items: payloadLines,
      });

      if (!result.success) {
        setCreateError(result.error ?? "Không thể tạo lệnh sản xuất");
        return;
      }

      toast.success("Đã tạo lệnh sản xuất");
      handleOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button disabled={!actionsEnabled}>
          <Plus className="mr-2 size-4" />
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

        <div className="space-y-4 px-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="mobile-production-number">Số lệnh</Label>
            <Input
              id="mobile-production-number"
              value={productionNumber}
              onChange={(event) => setProductionNumber(event.target.value)}
              placeholder="PRD-20260414-001"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mobile-production-branch">Bếp trung tâm</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger id="mobile-production-branch">
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="mobile-production-notes">Ghi chú</Label>
            <Textarea
              id="mobile-production-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Ca làm việc, đóng gói, ghi chú bàn giao..."
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label>Thành phẩm</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLine}
              >
                Thêm dòng
              </Button>
            </div>

            <div className="space-y-3">
              {lines.map((line, index) => (
                <div
                  key={`${index}-${line.finishedGoodId}`}
                  className="space-y-3 rounded-xl border bg-card p-3"
                >
                  <div className="space-y-2">
                    <Label>Thành phẩm</Label>
                    <Select
                      value={String(line.finishedGoodId)}
                      onValueChange={(value) => {
                        const option = finishedGoodsOptions.find(
                          (good) => good.id === Number(value),
                        );
                        updateLine(index, {
                          finishedGoodId: Number(value),
                          unit: option?.unit ?? line.unit,
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn thành phẩm" />
                      </SelectTrigger>
                      <SelectContent>
                        {finishedGoodsOptions.map((good) => (
                          <SelectItem key={good.id} value={String(good.id)}>
                            {good.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Số lượng</Label>
                      <FormattedNumberInput
                        value={line.quantity}
                        onValueChange={(value) =>
                          updateLine(index, { quantity: value })
                        }
                        maxFractionDigits={3}
                        placeholder="Số lượng"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Đơn vị</Label>
                      <Input
                        value={line.unit}
                        onChange={(event) =>
                          updateLine(index, { unit: event.target.value })
                        }
                        placeholder="ĐVT"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeLine(index)}
                      disabled={lines.length === 1}
                    >
                      <CircleSlash className="mr-2 size-4" />
                      Bỏ dòng
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {createError ? (
            <p className="text-sm text-destructive" role="alert">
              {createError}
            </p>
          ) : null}
        </div>

        <SheetFooter className="border-t px-4 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            Hủy
          </Button>
          <Button
            type="button"
            onClick={handleCreate}
            disabled={isPending || !actionsEnabled}
          >
            {isPending ? (
              <Spinner className="mr-2" />
            ) : null}
            Tạo lệnh
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
