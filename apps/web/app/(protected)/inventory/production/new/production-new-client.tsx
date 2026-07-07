/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@comtammatu/ui/components/sonner";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Combobox } from "@/components/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { AppSection } from "@/components/surface";
import { createProductionRun } from "../../production-run-actions";
import type { BranchOption, FinishedGoodOption } from "../../production-types";

interface ProductionNewClientProps {
  branches: BranchOption[];
  finishedGoods: FinishedGoodOption[];
  initialBranchId?: number;
  basePath: string;
}

export function ProductionNewClient({
  branches,
  finishedGoods,
  initialBranchId,
  basePath,
}: ProductionNewClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [branchId, setBranchId] = useState<number | undefined>(initialBranchId ?? branches[0]?.id);
  const [finishedGoodId, setFinishedGoodId] = useState<number | undefined>();
  const [plannedQuantity, setPlannedQuantity] = useState<string>("");
  const [entryUnitId, setEntryUnitId] = useState<number | undefined>();
  const [notes, setNotes] = useState<string>("");

  const selectedFg = finishedGoods.find((fg) => fg.id === finishedGoodId);
  const unitOptions = selectedFg ? [{ id: 0, name: selectedFg.unit }, ...(selectedFg.units || []).map((u: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) => ({ id: u.unit_id, name: (Array.isArray(u.units) ? u.units[0]?.name : u.units?.name) || "" }))] : [];

  const handleSave = () => {
    if (!branchId || !finishedGoodId || !plannedQuantity) {
      toast.error("Vui lòng điền đầy đủ thông tin");
      return;
    }

    startTransition(async () => {
      const res = await createProductionRun({
        branchId,
        finishedGoodId,
        plannedQuantity: parseFloat(plannedQuantity),
        entryUnitId: entryUnitId || undefined,
        notes,
      });

      if (res.success) {
        toast.success("Tạo lệnh sản xuất thành công");
        router.push(basePath);
      } else {
        toast.error(res.error || "Có lỗi xảy ra");
      }
    });
  };

  return (
    <AppSection className="p-6 space-y-6">
      <div className="grid gap-2">
        <Label>Chi nhánh</Label>
        <Select
          value={branchId?.toString()}
          onValueChange={(val) => setBranchId(parseInt(val, 10))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Chọn chi nhánh" />
          </SelectTrigger>
          <SelectContent>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id.toString()}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label>Thành phẩm</Label>
        <Combobox
          options={finishedGoods.map((fg) => ({
            value: fg.id.toString(),
            label: fg.name,
          }))}
          value={finishedGoodId?.toString() || ""}
          onValueChange={(val: string) => {
            setFinishedGoodId(val ? parseInt(val, 10) : undefined);
            setEntryUnitId(undefined); // Reset unit on change
          }}
          placeholder="Chọn thành phẩm..."
        />
      </div>

      <div className="grid gap-2">
        <Label>Số lượng dự kiến</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={plannedQuantity}
            onChange={(e) => setPlannedQuantity(e.target.value)}
            className="flex-1"
          />
          {unitOptions.length > 0 && (
            <Select
              value={entryUnitId?.toString() || "0"}
              onValueChange={(val) => setEntryUnitId(val === "0" ? undefined : parseInt(val, 10))}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {unitOptions.map((u) => (
                  <SelectItem key={u.id} value={u.id.toString()}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Ghi chú</Label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ghi chú thêm..."
        />
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button variant="outline" onClick={() => router.back()} disabled={isPending}>
          Hủy
        </Button>
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "Đang lưu..." : "Tạo mới"}
        </Button>
      </div>
    </AppSection>
  );
}
