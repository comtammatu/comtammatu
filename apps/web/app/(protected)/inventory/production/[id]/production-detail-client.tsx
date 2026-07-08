/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight as IconArrowRight } from "lucide-react";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  AppDetailFooter,
  AppSection,
} from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
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
  embedded?: boolean;
}

function formatProductionQuantity(value: number) {
  const rounded = Math.floor(value * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

export function ProductionDetailClient({
  run,
  recipeContext,
  embedded = false,
}: ProductionDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actualQuantity, setActualQuantity] = useState<string>(run.actual_quantity?.toString() || "");
  const maxProductionStr = recipeContext?.maxProductionQuantity != null
    ? formatProductionQuantity(recipeContext.maxProductionQuantity)
    : null;
  const [shortages, setShortages] = useState<ProductionShortageRow[]>([]);

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
      const parsedActual = actualQuantity.trim()
        ? Number.parseFloat(actualQuantity)
        : undefined;
      const actual = parsedActual != null && !Number.isNaN(parsedActual)
        ? parsedActual
        : undefined;
      
      const actualIngredients = [];
      if (recipeContext?.ingredients) {
        for (const ing of recipeContext.ingredients) {
          const val = ingredientUsages[ing.ingredient_id] ?? "";
          if (val.trim()) {
            const num = Number.parseFloat(val);
            if (!Number.isNaN(num)) {
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
  const canEdit = run.status === "draft" || run.status === "in_progress";
  const actionSize = embedded ? "touch" : "default";
  const ingredients = recipeContext?.ingredients ?? [];
  const branchSummary: ReactNode = run.branch_id === run.target_branch_id ? (
    run.branch_name
  ) : (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span>Sản xuất: {run.branch_name}</span>
      <IconArrowRight className="size-4 text-muted-foreground" />
      <span>Nhận: {run.target_branch_name}</span>
    </span>
  );
  const summaryItems: Array<{
    term: string;
    description: ReactNode;
    className?: string;
  }> = [
    {
      term: "Chi nhánh",
      description: branchSummary,
      className: "sm:col-span-2",
    },
    { term: "Ngày tạo", description: formatVNDate(run.created_at) },
    { term: "Thành phẩm", description: run.finished_good_name },
    { term: "Số lượng dự kiến", description: `${run.planned_quantity} ${unit}` },
  ];

  if (run.notes) {
    summaryItems.push({
      term: "Ghi chú",
      description: run.notes,
      className: "sm:col-span-2 lg:col-span-4",
    });
  }

  function renderIngredientUsageInput(ingredient: ProductionRecipeIngredient) {
    const maxQty = Math.floor(ingredient.max_ingredient_qty * 1000) / 1000;
    return (
      <div className="flex min-w-0 items-center justify-end gap-2">
        <Input
          aria-label={`Sử dụng thực tế ${ingredient.ingredient_name}`}
          type="number"
          min="0"
          step="0.001"
          max={maxQty}
          value={ingredientUsages[ingredient.ingredient_id] ?? ""}
          onChange={(event) =>
            handleIngredientChange(ingredient.ingredient_id, event.target.value)
          }
          disabled={isPending}
          className="min-w-0 text-right"
        />
        <span className="w-12 shrink-0 text-xs text-muted-foreground">
          {ingredient.unit_name}
        </span>
      </div>
    );
  }

  const ingredientColumns: DataTableColumn<ProductionRecipeIngredient>[] = [
    {
      key: "ingredient",
      header: "Nguyên liệu",
      render: (ingredient) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium">
            {ingredient.ingredient_name}
          </span>
          <span className="text-xs text-muted-foreground">
            Đơn vị: {ingredient.unit_name}
          </span>
        </div>
      ),
    },
    {
      key: "max",
      header: "Tồn tối đa",
      className: "text-right",
      render: (ingredient) => (
        <span className="font-mono tabular-nums">
          {formatProductionQuantity(ingredient.max_ingredient_qty)}
        </span>
      ),
    },
    {
      key: "actual",
      header: "Sử dụng thực tế",
      className: "text-right",
      render: (ingredient) => renderIngredientUsageInput(ingredient),
    },
  ];

  return (
    <div className="flex w-full flex-col gap-3">
      <AppSection title="Tổng quan lệnh">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summaryItems.map((item) => (
            <div
              key={item.term}
              className={`flex min-w-0 flex-col gap-1 ${item.className ?? ""}`}
            >
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {item.term}
              </dt>
              <dd className="min-w-0 text-sm leading-6 font-medium">
                {item.description}
              </dd>
            </div>
          ))}
        </dl>
      </AppSection>

      {canEdit ? (
        <AppSection
          title="Sản lượng thực tế"
          description="Nhập số lượng hoàn tất nếu khác số lượng dự kiến."
        >
          <div className="grid gap-2 sm:max-w-md">
            <div className="flex items-center gap-2">
              <Input
                aria-label="Số lượng thực tế"
                type="number"
                min="0"
                step="0.01"
                max={maxProductionStr ?? undefined}
                value={actualQuantity}
                onChange={(e) => setActualQuantity(e.target.value)}
                disabled={isPending}
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">{unit}</span>
            </div>
            {maxProductionStr && (
              <div className="text-sm text-muted-foreground">
                Tối đa có thể sản xuất: <span className="font-medium text-foreground">{maxProductionStr} {unit}</span>
              </div>
            )}
          </div>
        </AppSection>
      ) : null}

      {canEdit && ingredients.length > 0 ? (
        <AppSection
          title="Nguyên liệu sử dụng"
          description="Điều chỉnh lượng nguyên liệu thực tế trước khi hoàn tất lệnh."
          contentFlush
        >
          <DataTable
            data={ingredients}
            columns={ingredientColumns}
            getRowKey={(ingredient) => ingredient.ingredient_id}
            mobileCardRender={(ingredient) => (
              <Item variant="outline">
                <ItemContent>
                  <ItemTitle>{ingredient.ingredient_name}</ItemTitle>
                  <ItemDescription>
                    Tồn tối đa{" "}
                    {formatProductionQuantity(ingredient.max_ingredient_qty)}{" "}
                    {ingredient.unit_name}
                  </ItemDescription>
                </ItemContent>
                <ItemContent className="basis-full">
                  {renderIngredientUsageInput(ingredient)}
                </ItemContent>
              </Item>
            )}
          />
        </AppSection>
      ) : null}

      {shortages.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>Thiếu nguyên liệu trong kho để sản xuất</AlertTitle>
          <AlertDescription>
            <div className="mt-2 flex flex-col gap-1">
              {shortages.map((row) => (
                <div
                  key={row.ingredient_id}
                  className="flex flex-col gap-1 text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="font-medium text-foreground">
                    {row.ingredient_name}
                  </span>
                  <span>
                    Cần{" "}
                    <span className="font-mono">
                      {row.needed.toFixed(3)}
                    </span>{" "}
                    {row.unit}, còn{" "}
                    <span className="font-mono">
                      {row.on_hand.toFixed(3)}
                    </span>{" "}
                    {row.unit}
                  </span>
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {run.status === "completed" ? (
        <AppSection title="Kết quả hoàn tất">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex min-w-0 flex-col gap-1">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Số lượng thực tế
              </dt>
              <dd className="text-sm leading-6 font-medium">
                {run.actual_quantity} {unit}
              </dd>
            </div>
          </dl>
        </AppSection>
      ) : null}

      {canEdit ? (
        <AppDetailFooter
          sticky={embedded}
          leading={
            <Button
              type="button"
              onClick={handleCancel}
              disabled={isPending}
              variant="destructive"
              size={actionSize}
            >
              Hủy lệnh
            </Button>
          }
          trailing={
            <>
              {run.status === "draft" ? (
                <Button
                  type="button"
                  onClick={handleStart}
                  disabled={isPending}
                  size={actionSize}
                >
                  Bắt đầu sản xuất
                </Button>
              ) : null}
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
                variant={run.status === "draft" ? "secondary" : "default"}
                size={actionSize}
              >
                Hoàn thành
              </Button>
            </>
          }
        />
      ) : null}
    </div>
  );
}
