/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  Boxes as IconBoxes,
  ChefHat as IconChefHat,
} from "lucide-react";
import { formatDecimalInputValue } from "@comtammatu/shared/format";
import { formatVNDate } from "@comtammatu/shared/time";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { toast } from "@comtammatu/ui/components/sonner";
import { NumberPadSheet } from "@/components/form/number-pad-sheet";
import { StatusBadge, getStatusBadgeMeta } from "@/components/status-badge";
import { AppDetailFooter } from "@/components/surface";
import {
  BranchOperatorControlBar,
  BranchOperatorDetailList,
  BranchOperatorPage,
  BranchOperatorPanel,
  BranchOperatorStatusStrip,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  cancelProductionRun,
  confirmProductionRun,
  startProductionRun,
  type ProductionRecipeIngredient,
  type ProductionRunRow,
} from "@/(protected)/inventory/production-run-actions";
import { formatQty } from "@/(protected)/inventory/_lib/format";
import {
  productionQuantityFromBase,
  productionQuantityToBase,
} from "@/(protected)/inventory/_lib/production-unit-conversion";
import type { ProductionShortageRow } from "@/(protected)/inventory/production-types";

interface BranchProductionDetailClientProps {
  run: ProductionRunRow;
  recipeContext: {
    ingredients: ProductionRecipeIngredient[];
    maxProductionQuantity: number | null;
  } | null;
  recipeContextError: string | null;
  basePath: string;
}

type NumberPadTarget =
  | { kind: "actual" }
  | { kind: "ingredient"; ingredientId: number; name: string; unit: string };

export function BranchProductionDetailClient({
  run,
  recipeContext,
  recipeContextError,
  basePath,
}: BranchProductionDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actualQuantity, setActualQuantity] = useState(
    run.actual_quantity?.toString() ?? "",
  );
  const [shortages, setShortages] = useState<ProductionShortageRow[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [numberPadTarget, setNumberPadTarget] =
    useState<NumberPadTarget | null>(null);
  const plannedOutputBaseQuantity = productionQuantityToBase(
    run.planned_quantity,
    run.entry_unit_to_base_factor,
  );
  const maxProductionQuantity = productionQuantityFromBase(
    recipeContext?.maxProductionQuantity ?? Number.NaN,
    run.entry_unit_to_base_factor,
  );
  const [ingredientUsages, setIngredientUsages] = useState<
    Record<number, string>
  >(() => {
    const overrides = new Map<number, number>();
    for (const override of run.ingredients_override ?? []) {
      if (override.ingredient_id != null && override.actual_quantity != null) {
        overrides.set(override.ingredient_id, override.actual_quantity);
      }
    }
    return Object.fromEntries(
      (recipeContext?.ingredients ?? []).map((ingredient) => {
        const override = overrides.get(ingredient.ingredient_id);
        const defaultQuantity =
          plannedOutputBaseQuantity == null
            ? null
            : plannedOutputBaseQuantity * ingredient.default_usage_per_fg;
        return [
          ingredient.ingredient_id,
          override != null
            ? String(override)
            : defaultQuantity == null
              ? ""
              : formatDecimalInputValue(defaultQuantity, 3),
        ];
      }),
    );
  });

  const ingredients = recipeContext?.ingredients ?? [];
  const canEdit = run.status === "draft" || run.status === "in_progress";
  const canConfirm =
    canEdit &&
    recipeContext != null &&
    recipeContextError == null &&
    run.entry_unit_to_base_factor != null;
  const unit = run.entry_unit_name ?? "";
  const statusBadge = getStatusBadgeMeta("inventory", run.status);

  function resetActionFeedback() {
    setActionError(null);
    setShortages([]);
  }

  function handleStart() {
    resetActionFeedback();
    startTransition(async () => {
      const result = await startProductionRun(run.id);
      if (!result.success) {
        const message = result.error ?? "Không thể bắt đầu lệnh sản xuất.";
        setActionError(message);
        toast.error(message);
        return;
      }
      toast.success("Đã bắt đầu sản xuất");
      router.refresh();
    });
  }

  function handleConfirm() {
    resetActionFeedback();
    const parsedActual = Number.parseFloat(actualQuantity);
    const actualIngredients = ingredients.flatMap((ingredient) => {
      const value = ingredientUsages[ingredient.ingredient_id];
      if (!value) return [];
      const parsed = Number.parseFloat(value);
      if (Number.isNaN(parsed)) return [];
      return [
        {
          ingredient_id: ingredient.ingredient_id,
          actual_quantity: parsed,
        },
      ];
    });

    startTransition(async () => {
      const result = await confirmProductionRun({
        id: run.id,
        actualQuantity: Number.isNaN(parsedActual) ? undefined : parsedActual,
        actualIngredients:
          actualIngredients.length > 0 ? actualIngredients : undefined,
      });
      if (!result.success) {
        const nextShortages = Array.isArray(result.data)
          ? (result.data as ProductionShortageRow[])
          : [];
        if (nextShortages.length > 0) {
          setShortages(nextShortages);
          return;
        }
        const message = result.error ?? "Không thể hoàn thành lệnh sản xuất.";
        setActionError(message);
        toast.error(message);
        return;
      }
      toast.success("Đã hoàn thành lệnh sản xuất");
      router.refresh();
    });
  }

  async function handleCancel() {
    const accepted = await confirm({
      title: "Hủy lệnh sản xuất?",
      description:
        "Lệnh sẽ chuyển sang trạng thái đã hủy và không thể tiếp tục sản xuất.",
      confirmText: "Hủy lệnh",
      cancelText: "Giữ lệnh",
      variant: "destructive",
    });
    if (!accepted) return;
    resetActionFeedback();
    startTransition(async () => {
      const result = await cancelProductionRun(run.id);
      if (!result.success) {
        const message = result.error ?? "Không thể hủy lệnh sản xuất.";
        setActionError(message);
        toast.error(message);
        return;
      }
      toast.success("Đã hủy lệnh sản xuất");
      router.refresh();
    });
  }

  const primaryAction =
    run.status === "draft" ? (
      <Button
        type="button"
        size="touch-lg"
        disabled={isPending || !canConfirm}
        onClick={handleStart}
      >
        {isPending ? "Đang xử lý…" : "Bắt đầu sản xuất"}
      </Button>
    ) : run.status === "in_progress" ? (
      <Button
        type="button"
        size="touch-lg"
        disabled={isPending || !canConfirm}
        onClick={handleConfirm}
      >
        {isPending ? "Đang hoàn thành…" : "Hoàn thành lệnh"}
      </Button>
    ) : null;

  return (
    <BranchOperatorPage
      title={run.production_number}
      description={run.finished_good_name}
      hideHeaderOnMobile
      badge={{ children: statusBadge.label, variant: statusBadge.variant }}
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3">
        <BranchOperatorControlBar className="sm:hidden">
          <Button
            variant="ghost"
            size="icon-touch"
            render={
              <Link href={basePath} aria-label="Quay lại danh sách sản xuất" />
            }
          >
            <IconArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm font-semibold tabular-nums">
              {run.production_number}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {run.finished_good_name}
            </p>
          </div>
          <StatusBadge domain="inventory" value={run.status} size="sm" />
        </BranchOperatorControlBar>

        <BranchOperatorStatusStrip
          items={[
            {
              label: "Dự kiến",
              value: `${formatQty(run.planned_quantity)} ${unit}`,
              mono: true,
            },
            {
              label: "Thực tế",
              value:
                run.actual_quantity == null
                  ? "Chưa có"
                  : `${formatQty(run.actual_quantity)} ${unit}`,
              muted: run.actual_quantity == null,
              mono: run.actual_quantity != null,
            },
            {
              label: "Ngày tạo",
              value: formatVNDate(run.created_at),
            },
          ]}
        />

        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(17rem,0.8fr)] lg:items-start">
          <div className="flex min-w-0 flex-col gap-3 lg:col-start-1 lg:row-start-1">
            {canEdit && ingredients.length > 0 ? (
              <BranchOperatorPanel
                title="Nguyên liệu thực dùng"
                description="Điều chỉnh trước khi hoàn thành lệnh."
                icon={IconBoxes}
                size="sm"
                contentClassName="gap-2"
              >
                <ItemGroup className="gap-2" role="list">
                  {ingredients.map((ingredient) => (
                    <div key={ingredient.ingredient_id} role="listitem">
                      <Item
                        variant="outline"
                        className="min-h-24 flex-col items-stretch gap-3 touch-manipulation sm:flex-row sm:items-center"
                      >
                        <ItemContent className="min-w-0">
                          <ItemTitle className="line-clamp-none text-sm font-semibold">
                            {ingredient.ingredient_name}
                          </ItemTitle>
                          <ItemDescription className="line-clamp-none">
                            Có thể dùng tối đa{" "}
                            {formatQty(ingredient.max_ingredient_qty)}{" "}
                            {ingredient.unit_name}
                          </ItemDescription>
                        </ItemContent>
                        <div className="grid min-w-0 gap-1 sm:w-48 sm:shrink-0">
                          <Label
                            htmlFor={`branch-production-actual-${ingredient.ingredient_id}`}
                            className="text-xs"
                          >
                            Thực dùng
                          </Label>
                          <div className="flex min-w-0 items-center gap-2">
                            <Button
                              id={`branch-production-actual-${ingredient.ingredient_id}`}
                              type="button"
                              variant="outline"
                              size="touch"
                              className="min-w-0 flex-1 justify-between font-mono tabular-nums"
                              disabled={isPending}
                              onClick={() =>
                                setNumberPadTarget({
                                  kind: "ingredient",
                                  ingredientId: ingredient.ingredient_id,
                                  name: ingredient.ingredient_name,
                                  unit: ingredient.unit_name,
                                })
                              }
                            >
                              {ingredientUsages[ingredient.ingredient_id]
                                ? formatQty(
                                    Number.parseFloat(
                                      ingredientUsages[
                                        ingredient.ingredient_id
                                      ] ?? "",
                                    ),
                                  )
                                : "Nhập số lượng…"}
                            </Button>
                            <span className="w-10 shrink-0 text-xs text-muted-foreground">
                              {ingredient.unit_name}
                            </span>
                          </div>
                        </div>
                      </Item>
                    </div>
                  ))}
                </ItemGroup>
              </BranchOperatorPanel>
            ) : null}

            {actionError ? (
              <Alert variant="destructive">
                <AlertTitle>Thao tác không thành công</AlertTitle>
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-3 lg:col-start-2 lg:row-start-1">
            <BranchOperatorPanel
              title="Thông tin lệnh"
              icon={IconChefHat}
              size="sm"
            >
              <BranchOperatorDetailList
                columns={1}
                rows={[
                  { label: "Thành phẩm", value: run.finished_good_name },
                  {
                    label: "Nơi sản xuất",
                    value: run.branch_name,
                  },
                  {
                    label: "Nơi nhận",
                    value: run.target_branch_name,
                  },
                  {
                    label: "Số lượng dự kiến",
                    value: `${formatQty(run.planned_quantity)} ${unit}`,
                  },
                  ...(run.notes
                    ? [{ label: "Ghi chú", value: run.notes }]
                    : []),
                ]}
              />
            </BranchOperatorPanel>

            {canEdit ? (
              <BranchOperatorPanel
                title="Sản lượng hoàn tất"
                description="Nhập số lượng thực tế trước khi hoàn thành."
                size="sm"
              >
                <div className="grid gap-2">
                  <Label htmlFor="branch-production-actual-quantity">
                    Số lượng thực tế
                  </Label>
                  <div className="flex min-w-0 items-center gap-2">
                    <Button
                      id="branch-production-actual-quantity"
                      type="button"
                      variant="outline"
                      size="touch"
                      className="min-w-0 flex-1 justify-between font-mono tabular-nums"
                      disabled={isPending}
                      onClick={() => setNumberPadTarget({ kind: "actual" })}
                    >
                      {actualQuantity
                        ? formatQty(Number.parseFloat(actualQuantity))
                        : "Nhập số lượng…"}
                    </Button>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {unit}
                    </span>
                  </div>
                  {maxProductionQuantity != null ? (
                    <p className="text-sm text-muted-foreground">
                      Tối đa theo tồn: {formatQty(maxProductionQuantity)} {unit}
                    </p>
                  ) : null}
                </div>
              </BranchOperatorPanel>
            ) : run.status === "completed" ? (
              <BranchOperatorPanel title="Kết quả" tone="success" size="sm">
                <p className="font-mono text-lg font-semibold tabular-nums">
                  {formatQty(run.actual_quantity ?? 0)} {unit}
                </p>
              </BranchOperatorPanel>
            ) : null}

            {canEdit && !canConfirm ? (
              <Alert variant="destructive">
                <AlertTitle>Chưa thể hoàn thành lệnh</AlertTitle>
                <AlertDescription>
                  {recipeContextError ??
                    "Không thể kiểm tra đơn vị thành phẩm hoặc định mức nguyên liệu."}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        </div>

        {canEdit ? (
          <AppDetailFooter
            sticky
            leading={
              <Button
                type="button"
                variant="destructive"
                size="touch"
                disabled={isPending}
                onClick={handleCancel}
              >
                Hủy lệnh
              </Button>
            }
            trailing={primaryAction}
          />
        ) : null}

        <NumberPadSheet
          open={numberPadTarget != null}
          onOpenChange={(open) => {
            if (!open) setNumberPadTarget(null);
          }}
          title={
            numberPadTarget?.kind === "actual"
              ? "Sản lượng thực tế"
              : `Thực dùng: ${numberPadTarget?.name ?? ""}`
          }
          suffix={
            numberPadTarget?.kind === "ingredient" ? numberPadTarget.unit : unit
          }
          initialValue={
            numberPadTarget?.kind === "actual"
              ? Number.parseFloat(actualQuantity)
              : numberPadTarget?.kind === "ingredient"
                ? Number.parseFloat(
                    ingredientUsages[numberPadTarget.ingredientId] ?? "",
                  )
                : null
          }
          confirmLabel="Xong"
          maxFractionDigits={3}
          onConfirm={(value) => {
            if (numberPadTarget?.kind === "actual") {
              setActualQuantity(formatDecimalInputValue(value, 3));
              return;
            }
            if (numberPadTarget?.kind === "ingredient") {
              setIngredientUsages((previous) => ({
                ...previous,
                [numberPadTarget.ingredientId]: formatDecimalInputValue(
                  value,
                  3,
                ),
              }));
            }
          }}
        />

        <Sheet
          open={shortages.length > 0}
          onOpenChange={(open) => {
            if (!open) setShortages([]);
          }}
        >
          <SheetContent side="bottom" className="max-h-dvh-95">
            <SheetHeader>
              <SheetTitle>Thiếu nguyên liệu</SheetTitle>
              <p className="text-sm text-muted-foreground">
                Sửa thực chi rồi hoàn thành lại lệnh.
              </p>
            </SheetHeader>
            <ItemGroup className="mt-4 gap-2">
              {shortages.map((shortage) => (
                <Item key={shortage.ingredient_id} variant="outline">
                  <ItemContent>
                    <ItemTitle>{shortage.ingredient_name}</ItemTitle>
                    <ItemDescription>
                      Cần {formatQty(shortage.needed)} {shortage.unit}, còn{" "}
                      {formatQty(shortage.on_hand)} {shortage.unit}, thiếu{" "}
                      {formatQty(shortage.missing)} {shortage.unit}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
            <SheetFooter>
              <Button
                type="button"
                size="touch-lg"
                className="w-full"
                onClick={() => setShortages([])}
              >
                Sửa Thực chi
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
    </BranchOperatorPage>
  );
}
