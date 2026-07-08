/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { AppSection } from "@/components/surface";
import { startProductionRun, confirmProductionRun, cancelProductionRun } from "../../production-run-actions";
import type {
  ProductionRunRow,
  ProductionRecipeIngredient,
} from "../../production-run-actions";
import type { ProductionShortageRow } from "../../production-types";
import { formatVNDate } from "@comtammatu/shared/time";

interface ProductionDetailClientProps {
  run: ProductionRunRow;
  recipeContext: {
    ingredients: ProductionRecipeIngredient[];
    maxProductionQuantity: number | null;
  } | null;
}

export function ProductionDetailClient({ run, recipeContext }: ProductionDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actualQuantity, setActualQuantity] = useState<string>(run.actual_quantity?.toString() || "");
  const maxProductionStr = recipeContext?.maxProductionQuantity != null ? recipeContext.maxProductionQuantity.toString() : null;
  const [shortages, setShortages] = useState<ProductionShortageRow[]>([]);

  // Initialize ingredient states. Use planned quantity as default multiplier, unless actual_quantity is typed? 
  // Normally the default is based on planned_quantity as the RPC does.
  const [ingredientUsages, setIngredientUsages] = useState<Record<number, string>>(() => {
    const usages: Record<number, string> = {};
    if (recipeContext?.ingredients) {
      const overrides = Array.isArray(run.ingredients_override) ? run.ingredients_override : [];
      const overrideMap = new Map();
      overrides.forEach(o => {
        if (o.ingredient_id != null && o.actual_quantity != null) {
          overrideMap.set(o.ingredient_id, o.actual_quantity);
        }
      });

      for (const ing of recipeContext.ingredients) {
        if (overrideMap.has(ing.ingredient_id)) {
          usages[ing.ingredient_id] = overrideMap.get(ing.ingredient_id).toString();
        } else {
          const defaultQty = (run.planned_quantity * ing.recipe_quantity) / ing.yield_factor;
          usages[ing.ingredient_id] = defaultQty.toFixed(3);
        }
      }
    }
    return usages;
  });

  const handleIngredientChange = (id: number, val: string) => {
    setIngredientUsages(prev => ({ ...prev, [id]: val }));
  };

  const handleStart = () => {
    startTransition(async () => {
      const res = await startProductionRun(run.id);
      if (res.success) {
        toast.success("Đã bắt đầu lệnh sản xuất");
        router.refresh();
      } else {
        toast.error(res.error || "Có lỗi xảy ra");
      }
    });
  };

  const handleConfirm = () => {
    startTransition(async () => {
      const actual = actualQuantity ? parseFloat(actualQuantity) : undefined;
      
      const actualIngredients = [];
      if (recipeContext?.ingredients) {
        for (const ing of recipeContext.ingredients) {
          const val = ingredientUsages[ing.ingredient_id];
          if (val) {
            const num = parseFloat(val);
            if (!isNaN(num)) {
              actualIngredients.push({
                ingredient_id: ing.ingredient_id,
                actual_quantity: num,
              });
            }
          }
        }
      }

      const res = await confirmProductionRun({ 
        id: run.id, 
        actualQuantity: actual,
        actualIngredients: actualIngredients.length > 0 ? actualIngredients : undefined
      });
      
      if (res.success) {
        setShortages([]);
        toast.success("Đã xác nhận lệnh sản xuất");
        router.refresh();
      } else {
        toast.error(res.error || "Có lỗi xảy ra");
        const nextShortages = Array.isArray(res.data) ? (res.data as ProductionShortageRow[]) : [];
        setShortages(nextShortages);
        if (nextShortages.length > 0) {
          toast.error("Thiếu nguyên liệu trong kho để sản xuất.");
        }
      }
    });
  };

  const handleCancel = () => {
    if (!confirm("Bạn có chắc chắn muốn hủy lệnh này?")) return;
    
    startTransition(async () => {
      const res = await cancelProductionRun(run.id);
      if (res.success) {
        toast.success("Đã hủy lệnh sản xuất");
        router.refresh();
      } else {
        toast.error(res.error || "Có lỗi xảy ra");
      }
    });
  };

  const unit = run.entry_unit_name || "";

  return (
    <AppSection className="p-6 space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 md:col-span-1">
          <Label className="text-muted-foreground">Chi nhánh</Label>
          <div className="font-medium">
            {run.branch_id === run.target_branch_id 
              ? run.branch_name 
              : <span className="flex items-center gap-1">Sản xuất: {run.branch_name} <span className="text-muted-foreground text-xs mx-1">➔</span> Nhận: {run.target_branch_name}</span>
            }
          </div>
        </div>
        <div className="col-span-2 md:col-span-1">
          <Label className="text-muted-foreground">Ngày tạo</Label>
          <div className="font-medium">{formatVNDate(run.created_at)}</div>
        </div>
        <div>
          <Label className="text-muted-foreground">Thành phẩm</Label>
          <div className="font-medium">{run.finished_good_name}</div>
        </div>
        <div>
          <Label className="text-muted-foreground">SL Dự kiến</Label>
          <div className="font-medium">{run.planned_quantity} {unit}</div>
        </div>
        {run.notes && (
          <div className="col-span-2">
            <Label className="text-muted-foreground">Ghi chú</Label>
            <div className="font-medium">{run.notes}</div>
          </div>
        )}
      </div>

      {(run.status === "draft" || run.status === "in_progress") && (
        <div className="border-t pt-4 space-y-4">
          <div className="grid gap-2 max-w-xs">
            <Label>Số lượng thực tế (tùy chọn)</Label>
            <div className="flex gap-2 items-center">
              <Input
                type="number"
                min="0"
                step="0.01"
                max={maxProductionStr ?? undefined}
                value={actualQuantity}
                onChange={(e) => setActualQuantity(e.target.value)}
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">{unit}</span>
            </div>
            {maxProductionStr && (
              <div className="text-sm text-muted-foreground">
                Tối đa có thể sản xuất: <span className="font-medium text-foreground">{maxProductionStr} {unit}</span>
              </div>
            )}
          </div>

          {recipeContext && recipeContext.ingredients.length > 0 && (
            <div className="pt-2 border-t mt-4">
              <Label className="mb-2 block">Điều chỉnh nguyên liệu sử dụng</Label>
              <div className="flex flex-col gap-2">
                <div className="flex gap-4 items-center text-sm font-medium text-muted-foreground px-2">
                  <div className="flex-1">Nguyên liệu</div>
                  <div className="w-24 text-right">Tồn tối đa</div>
                  <div className="w-32">Sử dụng thực tế</div>
                </div>
                {recipeContext.ingredients.map((ing) => {
                  const maxQty = Math.floor(ing.max_ingredient_qty * 1000) / 1000;
                  return (
                    <div key={ing.ingredient_id} className="flex gap-4 items-center px-2 py-1 rounded-md hover:bg-muted/50">
                      <div className="flex-1 text-sm font-medium">
                        {ing.ingredient_name} <span className="text-muted-foreground font-normal">({ing.unit_name})</span>
                      </div>
                      <div className="w-24 text-right text-sm">
                        {maxQty}
                      </div>
                      <div className="w-32">
                        <Input
                          type="number"
                          min="0"
                          step="0.001"
                          max={maxQty}
                          value={ingredientUsages[ing.ingredient_id] ?? ""}
                          onChange={(e) => handleIngredientChange(ing.ingredient_id, e.target.value)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            {run.status === "draft" && (
              <Button onClick={handleStart} disabled={isPending}>
                Bắt đầu sản xuất
              </Button>
            )}
            <Button onClick={handleConfirm} disabled={isPending} variant={run.status === "draft" ? "secondary" : "default"}>
              Hoàn thành
            </Button>
            <Button onClick={handleCancel} disabled={isPending} variant="destructive">
              Hủy lệnh
            </Button>
          </div>

          {shortages.length > 0 ? (
            <Alert variant="destructive">
              <AlertTitle>Thiếu nguyên liệu trong kho để sản xuất</AlertTitle>
              <AlertDescription>
                <div className="mt-2 space-y-1">
                  {shortages.map((row) => (
                    <div
                      key={row.ingredient_id}
                      className="flex justify-between gap-2 text-muted-foreground"
                    >
                      <span className="font-medium text-foreground">
                        {row.ingredient_name}
                      </span>
                      <span>
                        Cần{" "}
                        <span className="font-mono">
                          {row.needed.toFixed(3)}
                        </span>{" "}
                        {row.unit}, còn
                        <span className="font-mono">
                          {" "}
                          {row.on_hand.toFixed(3)}{" "}
                        </span>
                        {row.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      )}
      
      {run.status === "completed" && (
        <div className="border-t pt-4">
            <Label className="text-muted-foreground">SL Thực tế</Label>
            <div className="font-medium">{run.actual_quantity} {unit}</div>
        </div>
      )}
    </AppSection>
  );
}
