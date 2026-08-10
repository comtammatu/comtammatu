/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import { Alert, AlertDescription, AlertTitle } from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
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
import { Combobox } from "@/components/form/combobox";
import { QuantityInput } from "@/components/form/domain-number-inputs";
import {
  AppBackLink,
  AppDetailFooter,
  AppEmptyState,
  AppPageHeader,
  AppSection,
  DocumentFormFrame,
} from "@/components/surface";
import { formatQty } from "@lib/inventory/format";
import { messages } from "@lib/messages";
import {
  createProductionRun,
  fetchProductionRecipeContext,
  type ProductionRecipeIngredient,
} from "../../production-run-actions";
import type {
  BranchOption,
  FinishedGoodOption,
  InventoryLocationOption,
} from "../../production-types";

interface ProductionNewClientProps {
  branches: BranchOption[];
  locations: InventoryLocationOption[];
  finishedGoods: FinishedGoodOption[];
  initialBranchId?: number;
  basePath: string;
}

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

export function ProductionNewClient({
  branches,
  locations,
  finishedGoods,
  initialBranchId,
  basePath,
}: ProductionNewClientProps) {
  const router = useRouter();
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
  const [notes, setNotes] = useState("");
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
    planned > maxProductionQuantity + 1e-9;
  const showBranchPicker = branches.length > 1 && initialBranchId == null;

  useEffect(() => {
    const defaults = resolveDefaultLocations(locations, branchId);
    setSourceLocationId(defaults.sourceLocationId);
    setTargetLocationId(defaults.targetLocationId);
  }, [branchId, locations]);

  useEffect(() => {
    if (!recipeSpecId || !branchId || !sourceLocationId) {
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
      !sourceLocationId ||
      !targetLocationId ||
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
        notes: notes || undefined,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Không thể tạo Lệnh sản xuất.");
        return;
      }
      toast.success("Đã tạo Lệnh sản xuất nháp.");
      router.push(`${basePath}/${result.data.productionRunId}`);
    });
  }

  const ingredientRows = useMemo(() => {
    if (!context?.ingredients.length) return [];
    return context.ingredients.map((ingredient) => {
      const needed =
        batchRatio == null ? null : batchRatio * ingredient.recipe_quantity;
      const onHand = ingredient.max_ingredient_qty;
      const short =
        needed != null && Number.isFinite(needed) && needed > onHand + 1e-9;
      return { ingredient, needed, onHand, short };
    });
  }, [batchRatio, context]);

  if (branches.length === 0) {
    return (
      <AppEmptyState
        mode="error"
        title="Chưa có Bếp Trung Tâm"
        description="Lệnh sản xuất chỉ được tạo tại site Bếp Trung Tâm."
      />
    );
  }

  const body = (
    <>
      <AppSection
        title="Kế hoạch sản xuất"
        description="Chọn công thức đang dùng và sản lượng. Kho xuất/nhập lấy mặc định của Bếp Trung Tâm."
      >
        <div className="grid gap-3">
          {showBranchPicker ? (
            <div className="grid max-w-md gap-2">
              <Label htmlFor="production-branch">Bếp Trung Tâm</Label>
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
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_11rem] md:items-end">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="production-recipe">Công thức</Label>
              <Combobox
                value={recipeSpecId?.toString() ?? ""}
                onValueChange={(value) => setRecipeSpecId(Number(value))}
                options={finishedGoods.map((good) => ({
                  value: String(good.recipeSpecId),
                  label: good.name,
                  hint: `${good.outputQuantity ?? "—"} ${good.outputUnitLabel ?? ""}`.trim(),
                }))}
                placeholder="Chọn công thức đang dùng"
                searchPlaceholder="Tìm thành phẩm"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="production-planned-quantity">Sản lượng kế hoạch</Label>
              <div className="flex items-center gap-2">
                <QuantityInput
                  id="production-planned-quantity"
                  className="w-full max-w-[11rem]"
                  value={plannedQuantity}
                  onValueChange={setPlannedQuantity}
                  min="0"
                  maxFractionDigits={3}
                />
                <span className="shrink-0 text-sm text-muted-foreground">
                  {outputUnit || "Đơn vị"}
                </span>
              </div>
            </div>
          </div>

          {context && maxProductionQuantity != null ? (
            <p className="text-sm text-muted-foreground">
              {INVENTORY_VI.productionMaxProducible(
                formatQty(maxProductionQuantity),
                outputUnit,
              )}
            </p>
          ) : null}

          {plannedExceedsStock ? (
            <Alert variant="destructive">
              <AlertTitle>{INVENTORY_VI.productionInsufficientStock}</AlertTitle>
              <AlertDescription>
                {INVENTORY_VI.productionPlanExceedsStock}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      </AppSection>

      <AppSection
        title="Nguyên liệu kế hoạch"
        description={INVENTORY_VI.productionIngredientsNeedVsStock}
      >
        {loadingContext ? (
          <p className="text-sm text-muted-foreground">
            {productionCopy.productionRecipeLoading}
          </p>
        ) : contextError ? (
          <AppEmptyState mode="error" title="Chưa thể tạo lệnh" description={contextError} />
        ) : ingredientRows.length ? (
          <div className="overflow-x-auto border">
            <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] gap-2 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
              <span>Nguyên liệu</span>
              <span className="text-right">{INVENTORY_VI.shortageNeeded}</span>
              <span className="text-right">{INVENTORY_VI.shortageOnHand}</span>
            </div>
            <div className="divide-y">
              {ingredientRows.map(({ ingredient, needed, onHand, short }) => (
                <div
                  key={ingredient.ingredient_id}
                  className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] items-baseline gap-2 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate font-medium">
                    {ingredient.ingredient_name}
                  </span>
                  <span className="text-right tabular-nums">
                    {needed == null ? "—" : formatQty(needed)}{" "}
                    <span className="text-muted-foreground">
                      {ingredient.unit_name}
                    </span>
                  </span>
                  <span
                    className={
                      short
                        ? "text-right tabular-nums text-destructive"
                        : "text-right tabular-nums"
                    }
                  >
                    {formatQty(onHand)}{" "}
                    <span className={short ? undefined : "text-muted-foreground"}>
                      {ingredient.unit_name}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {INVENTORY_VI.productionSelectRecipeForStock}
          </p>
        )}
      </AppSection>

      <AppSection title="Ghi chú">
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={500}
          placeholder="Ghi chú cho ca sản xuất"
        />
      </AppSection>
    </>
  );

  const footer = (
    <AppDetailFooter
      trailing={
        <>
          <Button variant="outline" onClick={() => router.push(basePath)}>
            Hủy
          </Button>
          <Button onClick={handleCreate} disabled={isPending || !context}>
            {isPending ? "Đang tạo…" : "Tạo lệnh nháp"}
          </Button>
        </>
      }
    />
  );

  return (
    <DocumentFormFrame
      header={
        <AppPageHeader
          title="Tạo Lệnh sản xuất"
          description="Tạo lệnh nháp từ một công thức đã duyệt."
          breadcrumb={<AppBackLink href={basePath}>Quay lại</AppBackLink>}
        />
      }
      footer={footer}
    >
      {body}
    </DocumentFormFrame>
  );
}
