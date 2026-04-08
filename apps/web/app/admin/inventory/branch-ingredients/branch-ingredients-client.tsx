"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "@comtammatu/ui/components/sonner";
import { Button } from "@comtammatu/ui/components/button";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { fetchIngredients } from "../actions";
import {
  fetchBranchIngredientIds,
  syncBranchIngredients,
} from "../branch-ingredients-actions";
import type { IngredientRow } from "../page";
import { EmptyStatePanel } from "../../components/empty-state-panel";

type BranchOpt = {
  id: number;
  name: string;
  is_headquarters: boolean;
};

export function BranchIngredientsClient({
  branches,
}: {
  branches: BranchOpt[];
}) {
  const [branchId, setBranchId] = useState<string>(
    branches[0]?.id?.toString() ?? "",
  );
  const [allIngredients, setAllIngredients] = useState<IngredientRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const res = await fetchIngredients();
      if (!res.success) {
        toast.error(res.error ?? "Không tải được danh mục");
        return;
      }
      setAllIngredients((res.data ?? []) as IngredientRow[]);
    });
  }, []);

  useEffect(() => {
    const id = Number(branchId);
    if (!Number.isFinite(id) || id <= 0) {
      setSelected(new Set());
      setLoaded(false);
      return;
    }
    setLoaded(false);
    startTransition(async () => {
      const res = await fetchBranchIngredientIds(id);
      if (!res.success) {
        toast.error(res.error ?? "Không tải cấu hình chi nhánh");
        setLoaded(true);
        return;
      }
      setSelected(new Set(res.data as number[]));
      setLoaded(true);
    });
  }, [branchId]);

  const sorted = useMemo(
    () => [...allIngredients].sort((a, b) => a.name.localeCompare(b.name)),
    [allIngredients],
  );

  function toggle(id: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function handleSave() {
    const bid = Number(branchId);
    if (!Number.isFinite(bid) || bid <= 0) {
      toast.error("Chọn chi nhánh");
      return;
    }
    startTransition(async () => {
      const res = await syncBranchIngredients({
        branchId: bid,
        ingredientIds: [...selected],
      });
      if (!res.success) {
        toast.error(res.error ?? "Không lưu được");
        return;
      }
      toast.success("Đã cập nhật nguyên liệu được phép cho chi nhánh");
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label>Chi nhánh</Label>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Chọn chi nhánh" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id.toString()}>
                  {b.name}
                  {b.is_headquarters ? " (Trụ sở)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          onClick={handleSave}
          disabled={isPending || !loaded || !branchId}
        >
          Lưu cấu hình
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Chỉ các nguyên liệu được chọn mới được phép ghi nhận tồn kho / luân
        chuyển / tiêu hao tại chi nhánh này. Thêm nguyên liệu mới tại tab
        &quot;Tồn kho &amp; NL&quot;, rồi bật tại đây cho từng chi nhánh.
      </p>

      {!loaded && branchId && (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      )}

      {loaded && (
        <ScrollArea className="h-[min(28rem,60vh)] rounded-md border p-4">
          <div className="space-y-3 pr-4">
            {sorted.map((ing) => (
              <label
                key={ing.id}
                className="flex cursor-pointer items-center gap-3 rounded-md py-1"
              >
                <Checkbox
                  checked={selected.has(ing.id)}
                  onCheckedChange={(v) => toggle(ing.id, v === true)}
                />
                <span className="text-sm">
                  <span className="font-medium">{ing.name}</span>
                  <span className="ml-2 text-muted-foreground">
                    ({ing.unit})
                  </span>
                  {!ing.is_active && (
                    <span className="ml-2 text-xs text-destructive">Ngừng</span>
                  )}
                </span>
              </label>
            ))}
            {sorted.length === 0 && (
              <EmptyStatePanel
                className="bg-transparent py-10"
                title="Chưa có nguyên liệu trong danh mục"
              />
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
