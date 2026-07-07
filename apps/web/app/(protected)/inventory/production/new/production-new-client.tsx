/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import { useState, useTransition, useEffect } from "react";
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
import { createProductionRun, fetchProductionRecipeContext, ProductionRecipeIngredient } from "../../production-run-actions";
import type { BranchOption, FinishedGoodOption } from "../../production-types";

interface ProductionNewClientProps {
  branches: BranchOption[];
  targetBranches: BranchOption[];
  finishedGoods: FinishedGoodOption[];
  initialBranchId?: number;
  basePath: string;
}

export function ProductionNewClient({
  branches,
  targetBranches,
  finishedGoods,
  initialBranchId,
  basePath,
}: ProductionNewClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [branchId, setBranchId] = useState<number | undefined>(initialBranchId ?? branches[0]?.id);
  const [targetBranchId, setTargetBranchId] = useState<number | undefined>(
    initialBranchId ?? branches[0]?.id,
  );
  const [finishedGoodId, setFinishedGoodId] = useState<number | undefined>();
  const [plannedQuantity, setPlannedQuantity] = useState<string>("");
  const [entryUnitId, setEntryUnitId] = useState<number | undefined>();
  const [notes, setNotes] = useState<string>("");

  const [recipeContext, setRecipeContext] = useState<{ ingredients: ProductionRecipeIngredient[], maxProductionQuantity: number | null } | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [ingredientUsages, setIngredientUsages] = useState<Record<number, string>>({});

  const selectedFg = finishedGoods.find((fg) => fg.id === finishedGoodId);
  const unitOptions = selectedFg
    ? [{ id: 0, name: selectedFg.unit }, ...(selectedFg.units || []).map((u) => ({ id: u.unit_id, name: u.unit_name || "" }))]
    : [];
  const canUseRecipeControls = branchId != null && finishedGoodId != null;
  const plannedQtyParsed = parseFloat(plannedQuantity);
  const hasValidPlannedQty = !Number.isNaN(plannedQtyParsed) && plannedQtyParsed > 0;

  const formatQty = (value: number | null | undefined) => {
    if (value == null) return "N/A";
    return Math.floor(value * 1000) / 1000;
  };

  // Fetch recipe context when branch or finished good changes
  useEffect(() => {
    if (branchId && finishedGoodId) {
      setIsLoadingContext(true);
      fetchProductionRecipeContext(finishedGoodId, branchId)
        .then(res => {
          if (res.success && res.data) {
            setRecipeContext(res.data);
          } else {
            setRecipeContext(null);
          }
        })
        .finally(() => {
          setIsLoadingContext(false);
        });
    } else {
      setRecipeContext(null);
    }
  }, [branchId, finishedGoodId]);

  // Update default ingredient usages when planned quantity changes
  useEffect(() => {
    if (recipeContext?.ingredients) {
      const parsedQty = parseFloat(plannedQuantity);
      const usages: Record<number, string> = {};
      for (const ing of recipeContext.ingredients) {
        if (!Number.isNaN(parsedQty) && parsedQty > 0 && ing.yield_factor > 0) {
          const defaultQty = (parsedQty * ing.recipe_quantity) / ing.yield_factor;
          usages[ing.ingredient_id] = defaultQty.toFixed(3);
        } else {
          usages[ing.ingredient_id] = "";
        }
      }
      setIngredientUsages(usages);
    }
  }, [recipeContext, plannedQuantity]);

  const handleSetMaxQuantity = () => {
    if (recipeContext?.maxProductionQuantity != null) {
      setPlannedQuantity(recipeContext.maxProductionQuantity.toString());
    } else {
      toast.error("Không thể tính toán số lượng tối đa (có thể kho đang trống)");
    }
  };

  const handleIngredientChange = (id: number, val: string) => {
    setIngredientUsages(prev => ({ ...prev, [id]: val }));
  };

  const handleSave = () => {
    if (!branchId || !finishedGoodId || !plannedQuantity) {
      toast.error("Vui lòng điền đầy đủ thông tin bắt buộc");
      return;
    }

    const parsedQty = parseFloat(plannedQuantity);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      toast.error("Số lượng phải lớn hơn 0");
      return;
    }

    const ingredientsOverride: { ingredient_id: number; actual_quantity: number }[] = [];
    if (recipeContext?.ingredients) {
      for (const ing of recipeContext.ingredients) {
        const val = ingredientUsages[ing.ingredient_id];
        if (val) {
          const num = parseFloat(val);
          if (!isNaN(num) && num >= 0) {
            ingredientsOverride.push({
              ingredient_id: ing.ingredient_id,
              actual_quantity: num,
            });
          }
        }
      }
    }

    startTransition(async () => {
      const res = await createProductionRun({
        branchId,
        finishedGoodId,
        plannedQuantity: parsedQty,
        entryUnitId: entryUnitId || undefined,
        notes,
        targetBranchId: targetBranchId || branchId,
        ingredientsOverride: ingredientsOverride.length > 0 ? ingredientsOverride : undefined,
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
      <div className="grid md:grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>Chi nhánh sản xuất (Tiêu hao nguyên liệu)</Label>
          <Select
            value={branchId?.toString()}
            onValueChange={(val) => setBranchId(parseInt(val, 10))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Chọn chi nhánh sản xuất" />
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
          <Label>Chi nhánh nhận (Nhập kho thành phẩm)</Label>
          <Select
            value={targetBranchId?.toString()}
            onValueChange={(val) => setTargetBranchId(parseInt(val, 10))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Chọn chi nhánh nhận" />
            </SelectTrigger>
            <SelectContent>
              {targetBranches.map((b) => (
                <SelectItem key={b.id} value={b.id.toString()}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
          <div className="relative flex-1">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={plannedQuantity}
              onChange={(e) => setPlannedQuantity(e.target.value)}
              className="pr-16"
              placeholder="Nhập số lượng..."
            />
            {canUseRecipeControls && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="absolute right-1 top-1 h-7 text-xs px-2"
                onClick={handleSetMaxQuantity}
                disabled={isLoadingContext || recipeContext == null}
              >
                Tối đa
              </Button>
            )}
          </div>
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
        {recipeContext?.maxProductionQuantity != null && (
          <p className="text-xs text-muted-foreground">
            Có thể sản xuất tối đa: <span className="font-medium text-foreground">{recipeContext.maxProductionQuantity}</span>
            {selectedFg?.unit ? ` ${selectedFg.unit}` : ""}
          </p>
        )}
      </div>

      {isLoadingContext && <p className="text-sm text-muted-foreground italic">Đang tải định mức nguyên liệu...</p>}

      {recipeContext && recipeContext.ingredients.length > 0 && (
        <div className="grid gap-2">
          <Label>Bước 2: Điều chỉnh số lượng phần nguyên liệu thực tế</Label>
          <div className="rounded-md border text-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50 border-b">
                <tr className="text-left text-muted-foreground">
                  <th className="p-3 font-medium">Tên nguyên liệu</th>
                  <th className="p-3 font-medium text-right">Tồn kho tối đa</th>
                  <th className="p-3 font-medium w-36">Cần dùng</th>
                  <th className="p-3 font-medium w-36">Sử dụng thực tế</th>
                </tr>
              </thead>
              <tbody>
                {recipeContext.ingredients.map((ing) => (
                  <tr key={ing.ingredient_id} className="border-b last:border-0 bg-background">
                    <td className="p-3">{ing.ingredient_name}</td>
                    <td className="p-3 text-right text-muted-foreground">
                      {formatQty(ing.max_ingredient_qty)} {ing.unit_name}
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {hasValidPlannedQty && ing.yield_factor > 0
                            ? `${formatQty((plannedQtyParsed * ing.recipe_quantity) / ing.yield_factor)} ${ing.unit_name}`
                            : "Nhập số lượng để xem"}
                        </span>
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <Input
                          className="h-8 text-right bg-background"
                          type="number"
                          min="0"
                          step="0.001"
                          value={ingredientUsages[ing.ingredient_id] ?? ""}
                          onChange={(e) => handleIngredientChange(ing.ingredient_id, e.target.value)}
                        />
                        <span className="text-muted-foreground w-8 shrink-0">{ing.unit_name}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {recipeContext && recipeContext.ingredients.length === 0 && (
        <p className="text-sm text-muted-foreground italic">Thành phẩm này chưa có định mức nguyên liệu.</p>
      )}

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
