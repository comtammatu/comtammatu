"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleSlash, Loader2, Plus } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
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
import { toast } from "@comtammatu/ui/components/sonner";
import { createProductionOrder } from "./production-actions";
import { defaultProductionNumber } from "./production-types";
import type {
  BranchOption,
  DraftLine,
  FinishedGoodOption,
} from "./production-types";

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
    if (!isDialogOpen) return;
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
    isDialogOpen,
    lines.length,
  ]);

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line)),
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
      prev.length <= 1 ? prev : prev.filter((_, i) => i !== index),
    );
  }

  function resetDialog() {
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
      setIsDialogOpen(false);
      resetDialog();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={isDialogOpen}
      onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) resetDialog();
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={!actionsEnabled}>
          <Plus className="mr-2 size-4" />
          Tạo lệnh sản xuất
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Tạo lệnh sản xuất</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="productionNumber">Số lệnh</Label>
              <Input
                id="productionNumber"
                value={productionNumber}
                onChange={(e) => setProductionNumber(e.target.value)}
                placeholder="PRD-20260414-001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branchId">Bếp trung tâm</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger id="branchId">
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Ghi chú</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ghi chú lô sản xuất, ca làm việc, yêu cầu đóng gói..."
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
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
                  className="grid gap-3 md:grid-cols-[1fr_120px_120px_auto]"
                >
                  <Select
                    value={String(line.finishedGoodId)}
                    onValueChange={(value) => {
                      const option = finishedGoodsOptions.find(
                        (g) => g.id === Number(value),
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
                  <Input
                    type="number"
                    min={0}
                    step={0.001}
                    value={line.quantity}
                    onChange={(e) =>
                      updateLine(index, { quantity: e.target.value })
                    }
                    placeholder="Số lượng"
                  />
                  <Input
                    value={line.unit}
                    onChange={(e) =>
                      updateLine(index, { unit: e.target.value })
                    }
                    placeholder="ĐVT"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLine(index)}
                    disabled={lines.length === 1}
                    className="self-start"
                  >
                    <CircleSlash className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {createError && (
            <p className="text-sm text-destructive" role="alert">
              {createError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsDialogOpen(false)}
            disabled={isPending}
          >
            Hủy
          </Button>
          <Button
            type="button"
            onClick={handleCreate}
            disabled={isPending || !actionsEnabled}
          >
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Tạo lệnh
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
