/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { INVENTORY_VI, ACTIONS_VI } from "@comtammatu/shared/messages";
import { Alert, AlertDescription, AlertTitle } from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Field, FieldLabel } from "@comtammatu/ui/components/field";
import { Frame } from "@comtammatu/ui/components/frame";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { Combobox } from "@/components/form/combobox";
import { AppDialog } from "@/components/form/form-dialog";
import { QuantityInput } from "@/components/form/domain-number-inputs";
import { AppEmptyState } from "@/components/surface";
import { formatQty } from "@lib/inventory/format";
import { messages } from "@lib/messages";
import {
  createProductionRun,
  fetchProductionRecipeContext,
  type ProductionRecipeIngredient,
} from "../production-run-actions";
import type {
  BranchOption,
  FinishedGoodOption,
  InventoryLocationOption,
} from "../production-types";

const productionCopy = messages.inventory.operatorFlow;

function resolveDefaultLocations(
  locations: InventoryLocationOption[],
  branchId: number | undefined,
) {
  const scopedSources = locations.filter(
    (location) =>
      location.branchId === branchId && location.kind === "warehouse",
  );
  const defaultSource =
    scopedSources.find((location) => location.isDefaultConsumption) ??
    scopedSources[0];
  return {
    sourceLocationId: defaultSource?.id,
    targetLocationId: defaultSource?.id,
  };
}

function formatCleanQuantity(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const roundedInt = Math.round(value);
  if (Math.abs(value - roundedInt) < 1e-4) {
    return formatQty(roundedInt);
  }
  const rounded = Math.round(value * 1000) / 1000;
  return formatQty(rounded);
}

export function ProductionCreateDialog({
  open,
  onOpenChange,
  branches,
  locations,
  finishedGoods,
  initialBranchId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: BranchOption[];
  locations: InventoryLocationOption[];
  finishedGoods: FinishedGoodOption[];
  initialBranchId?: number;
  onCreated: (runId: number) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const initialBranch =
    branches.find((branch) => branch.id === initialBranchId) ?? branches[0];
  const [branchId, setBranchId] = useState<number | undefined>(initialBranch?.id);
  const [sourceLocationId, setSourceLocationId] = useState<number | undefined>(
    () => resolveDefaultLocations(locations, initialBranch?.id).sourceLocationId,
  );
  const [targetLocationId, setTargetLocationId] = useState<number | undefined>(
    () => resolveDefaultLocations(locations, initialBranch?.id).targetLocationId,
  );
  const [recipeSpecId, setRecipeSpecId] = useState<number | undefined>();
  const [plannedQuantity, setPlannedQuantity] = useState("");
  const [context, setContext] = useState<{
    ingredients: ProductionRecipeIngredient[];
    maxProductionQuantity: number | null;
  } | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);

  const selectedRecipe = finishedGoods.find(
    (good) => good.recipeSpecId === recipeSpecId,
  );
  const planned = Number(plannedQuantity);
  const batchRatio =
    Number.isFinite(planned) &&
    planned > 0 &&
    selectedRecipe?.outputQuantity &&
    selectedRecipe.outputQuantity > 0
      ? planned / selectedRecipe.outputQuantity
      : null;
  const outputUnit = selectedRecipe?.outputUnitLabel ?? "";
  const maxProductionQuantity = context?.maxProductionQuantity ?? null;
  const plannedExceedsStock =
    batchRatio != null &&
    maxProductionQuantity != null &&
    planned > maxProductionQuantity + 1e-6;
  const showBranchPicker = branches.length > 1 && initialBranchId == null;

  useEffect(() => {
    if (!open) {
      setRecipeSpecId(undefined);
      setPlannedQuantity("");
      setContext(null);
      setContextError(null);
    } else if (finishedGoods.length > 0 && recipeSpecId == null) {
      const firstGood = finishedGoods[0];
      if (firstGood) {
        setRecipeSpecId(firstGood.recipeSpecId);
        setPlannedQuantity(String(firstGood.outputQuantity ?? 1));
      }
    }
  }, [open, finishedGoods, recipeSpecId]);

  useEffect(() => {
    const defaults = resolveDefaultLocations(locations, branchId);
    setSourceLocationId(defaults.sourceLocationId);
    setTargetLocationId(defaults.targetLocationId);
  }, [branchId, locations]);

  useEffect(() => {
    if (!recipeSpecId || !branchId) {
      setContext(null);
      setContextError(null);
      return;
    }
    let active = true;
    setLoadingContext(true);
    setContextError(null);
    fetchProductionRecipeContext(recipeSpecId, branchId, sourceLocationId)
      .then((result) => {
        if (!active) return;
        if (result.success && result.data) setContext(result.data);
        else {
          setContext(null);
          setContextError(result.error ?? productionCopy.productionRecipeLoadFailed);
        }
      })
      .catch(() => {
        if (active) setContextError(productionCopy.productionRecipeLoadFailed);
      })
      .finally(() => {
        if (active) setLoadingContext(false);
      });
    return () => {
      active = false;
    };
  }, [branchId, recipeSpecId, sourceLocationId]);

  function handleCreate() {
    if (
      !branchId ||
      !recipeSpecId ||
      !Number.isFinite(planned) ||
      planned <= 0 ||
      !context
    ) {
      toast.error(INVENTORY_VI.productionCreateValidate);
      return;
    }
    startTransition(async () => {
      const result = await createProductionRun({
        branchId,
        recipeSpecId,
        plannedQuantity: planned,
        sourceLocationId,
        targetLocationId,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Không thể tạo Lệnh sản xuất.");
        return;
      }
      toast.success("Đã tạo Lệnh sản xuất nháp.");
      onOpenChange(false);
      onCreated(result.data.productionRunId);
    });
  }

  const ingredientRows = useMemo(() => {
    if (!context?.ingredients.length) return [];
    return context.ingredients.map((ingredient) => {
      const rawNeeded =
        batchRatio == null ? null : batchRatio * ingredient.recipe_quantity;
      const needed =
        rawNeeded == null
          ? null
          : Math.abs(rawNeeded - Math.round(rawNeeded)) < 1e-6
            ? Math.round(rawNeeded)
            : Math.round(rawNeeded * 1000) / 1000;
      const rawOnHand = ingredient.max_ingredient_qty;
      const onHand =
        Math.abs(rawOnHand - Math.round(rawOnHand)) < 1e-6
          ? Math.round(rawOnHand)
          : Math.round(rawOnHand * 1000) / 1000;
      const short =
        needed != null && Number.isFinite(needed) && needed > onHand + 1e-6;
      const missing =
        needed != null && Number.isFinite(needed) && short
          ? Math.round((needed - onHand) * 1000) / 1000
          : 0;
      return { ingredient, needed, onHand, short, missing };
    });
  }, [batchRatio, context]);

  const shortageCount = useMemo(
    () => ingredientRows.filter((row) => row.short).length,
    [ingredientRows],
  );
  const totalIngredients = ingredientRows.length;

  if (!open) return null;

  if (branches.length === 0) {
    return (
      <AppDialog
        open
        onOpenChange={onOpenChange}
        title="Tạo Lệnh sản xuất"
        footer={
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {ACTIONS_VI.close}
          </Button>
        }
      >
        <AppEmptyState
          mode="error"
          title="Chưa có Bếp Trung Tâm"
          description="Lệnh sản xuất chỉ được tạo tại site Bếp Trung Tâm."
        />
      </AppDialog>
    );
  }

  return (
    <AppDialog
      open
      onOpenChange={onOpenChange}
      title="Tạo Lệnh sản xuất (Bếp Trung Tâm)"
      description="Lên kế hoạch sản xuất thành phẩm. Dữ liệu tồn kho được đối soát tự động từ Kho Bếp Trung Tâm."
      contentClassName="sm:max-w-3xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {ACTIONS_VI.cancel}
          </Button>
          <Button
            type="button"
            onClick={handleCreate}
            disabled={
              isPending ||
              !context ||
              !recipeSpecId ||
              !Number.isFinite(planned) ||
              planned <= 0
            }
          >
            {isPending ? "Đang tạo…" : "Tạo lệnh nháp"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Section 1: Kế hoạch sản xuất */}
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold text-foreground">Kế hoạch sản xuất</h4>

          <div className="grid gap-3">
            {showBranchPicker ? (
              <Field className="max-w-md gap-1.5">
                <FieldLabel htmlFor="production-branch">Bếp Trung Tâm</FieldLabel>
                <Select
                  value={branchId?.toString()}
                  onValueChange={(value) => setBranchId(Number(value))}
                >
                  <SelectTrigger id="production-branch">
                    <SelectValue placeholder="Chọn Bếp TT" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={String(branch.id)}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}

            <div className="grid gap-3 md:flex md:items-end">
              <Field className="min-w-0 flex-1 gap-1.5">
                <FieldLabel htmlFor="production-recipe">Công thức</FieldLabel>
                <Combobox
                  id="production-recipe"
                  className="min-w-0"
                  size="field"
                  value={recipeSpecId?.toString() ?? ""}
                  onValueChange={(value) => {
                    const nextSpecId = Number(value);
                    setRecipeSpecId(nextSpecId);
                    const good = finishedGoods.find((g) => g.recipeSpecId === nextSpecId);
                    if (good && (!plannedQuantity || Number(plannedQuantity) <= 0)) {
                      setPlannedQuantity(String(good.outputQuantity ?? 1));
                    }
                  }}
                  options={finishedGoods.map((good) => ({
                    value: String(good.recipeSpecId),
                    label: good.name,
                    hint: `${good.outputQuantity ?? "—"} ${good.outputUnitLabel ?? ""}`.trim(),
                  }))}
                  placeholder="Chọn công thức đang dùng"
                  searchPlaceholder="Tìm thành phẩm"
                />
              </Field>
              <Field className="w-auto shrink-0 gap-1.5">
                <FieldLabel htmlFor="production-planned-quantity">Sản lượng kế hoạch</FieldLabel>
                <div className="flex items-center gap-2">
                  <QuantityInput
                    id="production-planned-quantity"
                    className="w-44"
                    controlSize="field"
                    value={plannedQuantity}
                    onValueChange={setPlannedQuantity}
                    min="0"
                    maxFractionDigits={3}
                  />
                  <span className="shrink-0 text-sm font-medium text-muted-foreground">
                    {outputUnit || "Đơn vị"}
                  </span>
                </div>
              </Field>
            </div>

            {context && maxProductionQuantity != null ? (
              <p className="text-xs text-muted-foreground">
                {INVENTORY_VI.productionMaxProducible(
                  formatCleanQuantity(maxProductionQuantity),
                  outputUnit,
                )}
              </p>
            ) : null}

            {plannedExceedsStock ? (
              <Alert variant="default">
                <AlertTitle className="font-semibold text-warning">{INVENTORY_VI.productionInsufficientStock}</AlertTitle>
                <AlertDescription className="text-xs text-foreground/80">
                  {INVENTORY_VI.productionPlanExceedsStock}
                  <span className="block mt-0.5 text-muted-foreground text-2xs">
                    Lệnh vẫn có thể tạo ở trạng thái Nháp để Bếp trưởng lên kế hoạch chuẩn bị nguyên liệu.
                  </span>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        </div>

        {/* Section 2: Nguyên liệu kế hoạch */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">Nguyên liệu kế hoạch</h4>
              <span className="text-xs text-muted-foreground">· Kho Bếp Trung Tâm</span>
            </div>
            {totalIngredients > 0 ? (
              shortageCount > 0 ? (
                <Badge variant="warning" className="text-2xs font-normal">
                  Thiếu {shortageCount}/{totalIngredients} nguyên liệu
                </Badge>
              ) : (
                <Badge variant="outline" className="text-success text-2xs font-normal">
                  Đủ tất cả {totalIngredients} nguyên liệu
                </Badge>
              )
            ) : null}
          </div>

          {loadingContext ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {productionCopy.productionRecipeLoading}
            </p>
          ) : contextError ? (
            <AppEmptyState mode="error" title="Chưa thể tạo lệnh" description={contextError} />
          ) : ingredientRows.length ? (
            <Frame className="overflow-hidden">
              <div className="flex gap-2 border-b bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="min-w-0 flex-1">Nguyên liệu</span>
                <span className="w-24 shrink-0 text-right">{INVENTORY_VI.shortageNeeded}</span>
                <span className="w-24 shrink-0 text-right">{INVENTORY_VI.shortageOnHand}</span>
                <span className="w-28 shrink-0 text-right">Đối chiếu</span>
              </div>
              <ScrollArea className="h-60">
                <div className="divide-y">
                  {ingredientRows.map(({ ingredient, needed, onHand, short, missing }) => (
                    <div
                      key={ingredient.ingredient_id}
                      className="flex items-center gap-2 px-3 py-2.5 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {ingredient.ingredient_name}
                      </span>
                      <span className="w-24 shrink-0 text-right tabular-nums text-xs font-mono">
                        {formatCleanQuantity(needed)}{" "}
                        <span className="text-muted-foreground">
                          {ingredient.unit_name}
                        </span>
                      </span>
                      <span className="w-24 shrink-0 text-right tabular-nums text-xs font-mono">
                        {formatCleanQuantity(onHand)}{" "}
                        <span className="text-muted-foreground">
                          {ingredient.unit_name}
                        </span>
                      </span>
                      <span className="w-28 shrink-0 text-right">
                        {short ? (
                          <Badge variant="warning" className="font-mono text-2xs">
                            Thiếu {formatCleanQuantity(missing)} {ingredient.unit_name}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-success text-2xs">
                            Đủ tồn
                          </Badge>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Frame>
          ) : (
            <div className="border border-dashed p-4 text-center text-sm text-muted-foreground">
              {INVENTORY_VI.productionSelectRecipeForStock}
            </div>
          )}
        </div>
      </div>
    </AppDialog>
  );
}
