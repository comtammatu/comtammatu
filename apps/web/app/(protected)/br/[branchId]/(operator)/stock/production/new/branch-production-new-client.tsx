/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  Boxes as IconBoxes,
  ChefHat as IconChefHat,
  MapPin as IconMapPin,
} from "lucide-react";
import { formatDecimalInputValue } from "@comtammatu/shared/format";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
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
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { toast } from "@comtammatu/ui/components/sonner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { Combobox } from "@/components/form/combobox";
import { NumberPadSheet } from "@/components/form/number-pad-sheet";
import { AppDetailFooter } from "@/components/surface";
import {
  BranchOperatorControlBar,
  BranchOperatorInlineState,
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  fetchProductionRecipeContext,
  recordProductionRun,
  type ProductionRecipeIngredient,
} from "@/(protected)/inventory/production-run-actions";
import { tTerm } from "@/(protected)/inventory/_lib/dictionary";
import { formatQty } from "@lib/inventory/format";
import { getIngredientUnitOptions } from "@lib/inventory/unit-options";
import {
  productionQuantityFromBase,
  productionQuantityToBase,
} from "@/(protected)/inventory/_lib/production-unit-conversion";
import type {
  BranchOption,
  FinishedGoodOption,
  InventoryLocationOption,
  ProductionShortageRow,
} from "@/(protected)/inventory/production-types";

interface BranchProductionNewClientProps {
  branchId: number;
  branches: BranchOption[];
  locations: InventoryLocationOption[];
  finishedGoods: FinishedGoodOption[];
  basePath: string;
}

function locationKindLabel(location: InventoryLocationOption) {
  if (location.branchKind === "branch" && location.kind === "warehouse") {
    return tTerm("branchWarehouse", "button");
  }
  return location.name;
}

function locationLabel(location: InventoryLocationOption) {
  const kindLabel = locationKindLabel(location);
  return location.branchName === kindLabel
    ? kindLabel
    : `${location.branchName} · ${kindLabel}`;
}

function pickSourceLocation(
  locations: InventoryLocationOption[],
  branchId: number,
) {
  const candidates = locations.filter(
    (location) => location.branchId === branchId,
  );
  return (
    candidates.find((location) => location.isDefaultConsumption) ??
    candidates.find((location) => location.isDefaultReceive) ??
    candidates[0]
  );
}

function pickTargetLocation(
  locations: InventoryLocationOption[],
  branchId: number,
) {
  const candidates = locations.filter(
    (location) => location.branchId === branchId,
  );
  return (
    candidates.find((location) => location.isDefaultReceive) ?? candidates[0]
  );
}

function recipeUsageDefaults(
  ingredients: ProductionRecipeIngredient[],
  plannedOutputBaseQuantity: number | null,
) {
  const nextUsages: Record<number, string> = {};
  for (const ingredient of ingredients) {
    const defaultQuantity =
      plannedOutputBaseQuantity != null && ingredient.default_usage_per_fg > 0
        ? plannedOutputBaseQuantity * ingredient.default_usage_per_fg
        : null;
    nextUsages[ingredient.ingredient_id] =
      defaultQuantity == null
        ? ""
        : formatDecimalInputValue(defaultQuantity, 3);
  }
  return nextUsages;
}

type NumberPadTarget =
  | { kind: "planned" }
  | { kind: "actual" }
  | { kind: "ingredient"; ingredientId: number; name: string; unit: string };

export function BranchProductionNewClient({
  branchId: routeBranchId,
  branches,
  locations,
  finishedGoods,
  basePath,
}: BranchProductionNewClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const productionBranchIds = new Set(branches.map((branch) => branch.id));
  const routeLocations = locations.filter(
    (location) =>
      productionBranchIds.has(location.branchId) &&
      location.branchId === routeBranchId,
  );
  const materialSourceLocations = routeLocations.filter(
    (location) => location.kind !== "production_storage",
  );
  const sourceLocations =
    materialSourceLocations.length > 0
      ? materialSourceLocations
      : routeLocations;
  const productionStorageLocations = routeLocations.filter(
    (location) => location.kind === "production_storage",
  );
  const targetLocations =
    productionStorageLocations.length > 0
      ? productionStorageLocations
      : routeLocations;
  const initialSourceLocation = pickSourceLocation(
    sourceLocations,
    routeBranchId,
  );
  const initialTargetLocation =
    pickTargetLocation(targetLocations, routeBranchId) ?? targetLocations[0];
  const hasSourceLocationChoice = sourceLocations.length > 1;
  const hasTargetLocationChoice = targetLocations.length > 1;
  const hasLocationChoices = hasSourceLocationChoice || hasTargetLocationChoice;

  const [sourceLocationId, setSourceLocationId] = useState<number | undefined>(
    initialSourceLocation?.id,
  );
  const [targetBranchId, setTargetBranchId] = useState<number | undefined>(
    initialTargetLocation?.branchId,
  );
  const [targetLocationId, setTargetLocationId] = useState<number | undefined>(
    initialTargetLocation?.id,
  );
  const [finishedGoodId, setFinishedGoodId] = useState<number | undefined>();
  const [plannedQuantity, setPlannedQuantity] = useState("");
  const [actualQuantity, setActualQuantity] = useState("");
  const [entryUnitId, setEntryUnitId] = useState<number | undefined>();
  const [notes, setNotes] = useState("");
  const [recipeContext, setRecipeContext] = useState<{
    ingredients: ProductionRecipeIngredient[];
    maxProductionQuantity: number | null;
  } | null>(null);
  const [recipeContextError, setRecipeContextError] = useState<string | null>(
    null,
  );
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [ingredientUsages, setIngredientUsages] = useState<
    Record<number, string>
  >({});
  const [numberPadTarget, setNumberPadTarget] =
    useState<NumberPadTarget | null>(null);
  const [shortages, setShortages] = useState<ProductionShortageRow[]>([]);

  const selectedFinishedGood = finishedGoods.find(
    (finishedGood) => finishedGood.id === finishedGoodId,
  );
  const outputUnits = getIngredientUnitOptions(selectedFinishedGood, {
    includeToBaseFactor: true,
  });
  const selectedOutputUnit =
    entryUnitId == null
      ? outputUnits.find((unit) => unit.isBase)
      : outputUnits.find((unit) => unit.unitId === entryUnitId);
  const selectedOutputUnitName =
    selectedOutputUnit?.label ?? selectedFinishedGood?.unit;
  const plannedQuantityNumber = Number.parseFloat(plannedQuantity);
  const actualQuantityNumber = Number.parseFloat(actualQuantity);
  const hasValidPlannedQuantity =
    !Number.isNaN(plannedQuantityNumber) && plannedQuantityNumber > 0;
  const hasValidActualQuantity =
    !Number.isNaN(actualQuantityNumber) && actualQuantityNumber > 0;
  const plannedOutputBaseQuantity = hasValidPlannedQuantity
    ? productionQuantityToBase(
        plannedQuantityNumber,
        selectedOutputUnit?.toBaseFactor,
      )
    : null;
  const maxProductionInSelectedUnit = productionQuantityFromBase(
    recipeContext?.maxProductionQuantity ?? Number.NaN,
    selectedOutputUnit?.toBaseFactor,
  );
  const hasRecipeContext = (recipeContext?.ingredients.length ?? 0) > 0;
  const canRecordProductionRun =
    sourceLocationId != null &&
    targetBranchId != null &&
    targetLocationId != null &&
    finishedGoodId != null &&
    hasValidPlannedQuantity &&
    hasValidActualQuantity &&
    plannedOutputBaseQuantity != null &&
    hasRecipeContext &&
    !isLoadingContext &&
    recipeContextError == null;

  useEffect(() => {
    if (sourceLocationId == null || finishedGoodId == null) {
      setRecipeContext(null);
      setRecipeContextError(null);
      setIsLoadingContext(false);
      return;
    }

    let active = true;
    setIsLoadingContext(true);
    setRecipeContext(null);
    setRecipeContextError(null);
    fetchProductionRecipeContext(
      finishedGoodId,
      routeBranchId,
      sourceLocationId,
    )
      .then((result) => {
        if (!active) return;
        if (result.success && result.data) {
          setRecipeContext(result.data);
          return;
        }
        setRecipeContext(null);
        setRecipeContextError(
          result.error ?? "Không thể kiểm tra định mức và tồn kho.",
        );
      })
      .catch(() => {
        if (!active) return;
        setRecipeContext(null);
        setRecipeContextError("Không thể kiểm tra định mức và tồn kho.");
      })
      .finally(() => {
        if (active) setIsLoadingContext(false);
      });

    return () => {
      active = false;
    };
  }, [finishedGoodId, routeBranchId, sourceLocationId]);

  useEffect(() => {
    setIngredientUsages(
      recipeUsageDefaults(
        recipeContext?.ingredients ?? [],
        plannedOutputBaseQuantity,
      ),
    );
  }, [plannedOutputBaseQuantity, recipeContext]);

  function handleTargetLocationChange(value: string) {
    const nextLocationId = Number.parseInt(value, 10);
    const nextLocation = targetLocations.find(
      (location) => location.id === nextLocationId,
    );
    setTargetLocationId(nextLocationId);
    setTargetBranchId(nextLocation?.branchId);
  }

  function handleSetMaxQuantity() {
    if (maxProductionInSelectedUnit == null) return;
    setPlannedQuantity(formatDecimalInputValue(maxProductionInSelectedUnit, 3));
  }

  function handleApplyRecipeDefaults() {
    setIngredientUsages(
      recipeUsageDefaults(
        recipeContext?.ingredients ?? [],
        plannedOutputBaseQuantity,
      ),
    );
  }

  function neededQuantity(ingredient: ProductionRecipeIngredient) {
    if (
      plannedOutputBaseQuantity == null ||
      ingredient.default_usage_per_fg <= 0
    ) {
      return "Nhập sản lượng để tính";
    }
    return `${formatQty(
      plannedOutputBaseQuantity * ingredient.default_usage_per_fg,
    )} ${ingredient.unit_name}`;
  }

  function handleRecord() {
    if (!canRecordProductionRun || finishedGoodId == null) {
      toast.error(
        "Cần nhập sản lượng định làm, thực ra và kiểm tra định mức trước khi ghi nhận.",
      );
      return;
    }

    const ingredientsOverride = (recipeContext?.ingredients ?? []).flatMap(
      (ingredient) => {
        const value = ingredientUsages[ingredient.ingredient_id];
        if (!value) return [];
        const parsed = Number.parseFloat(value);
        if (Number.isNaN(parsed) || parsed < 0) return [];
        return [
          {
            ingredient_id: ingredient.ingredient_id,
            actual_quantity: parsed,
          },
        ];
      },
    );

    startTransition(async () => {
      const recordResult = await recordProductionRun({
        branchId: routeBranchId,
        finishedGoodId,
        plannedQuantity: plannedQuantityNumber,
        entryUnitId: entryUnitId ?? undefined,
        notes,
        targetBranchId,
        sourceLocationId,
        targetLocationId,
        actualQuantity: actualQuantityNumber,
        ingredientsOverride:
          ingredientsOverride.length > 0 ? ingredientsOverride : undefined,
      });
      if (!recordResult.success) {
        const nextShortages = Array.isArray(recordResult.data)
          ? (recordResult.data as ProductionShortageRow[])
          : [];
        if (nextShortages.length > 0) {
          setShortages(nextShortages);
          return;
        }
        toast.error(recordResult.error ?? "Không thể ghi nhận mẻ sản xuất.");
        return;
      }
      toast.success("Đã ghi nhận mẻ sản xuất");
      router.push(basePath);
      router.refresh();
    });
  }

  const readinessLabel = !finishedGoodId
    ? "Chọn thành phẩm"
    : !hasValidPlannedQuantity || !hasValidActualQuantity
      ? "Nhập sản lượng"
      : !hasRecipeContext
        ? "Đang kiểm tra định mức"
        : "Sẵn sàng tạo lệnh";

  return (
    <BranchOperatorPage
      title="Ghi nhận mẻ sản xuất"
      description="Ghi lại định làm, thực ra và thực chi trong một lần."
      hideHeaderOnMobile
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3">
        <BranchOperatorControlBar className="sm:hidden">
          <Button
            variant="ghost"
            size="icon-touch"
            render={<Link href={basePath} aria-label="Quay lại Sản xuất" />}
          >
            <IconArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              Ghi nhận mẻ sản xuất
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {readinessLabel}
            </p>
          </div>
        </BranchOperatorControlBar>

        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
          <div className="flex min-w-0 flex-col gap-3">
            <BranchOperatorPanel
              title="Thành phẩm và sản lượng"
              icon={IconChefHat}
              size="sm"
              contentClassName="gap-3"
            >
              <div className="grid gap-2">
                <Label htmlFor="branch-production-finished-good">
                  Thành phẩm
                </Label>
                <Combobox
                  id="branch-production-finished-good"
                  options={finishedGoods.map((finishedGood) => ({
                    value: String(finishedGood.id),
                    label: finishedGood.name,
                  }))}
                  value={finishedGoodId ? String(finishedGoodId) : ""}
                  onValueChange={(value) => {
                    setFinishedGoodId(
                      value ? Number.parseInt(value, 10) : undefined,
                    );
                    setEntryUnitId(undefined);
                  }}
                  placeholder="Chọn thành phẩm…"
                  size="touch"
                />
              </div>

              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="branch-production-planned-quantity">
                    Định làm
                  </Label>
                  {finishedGoodId ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="touch"
                      onClick={handleSetMaxQuantity}
                      disabled={
                        isLoadingContext || maxProductionInSelectedUnit == null
                      }
                    >
                      Tối đa theo tồn
                    </Button>
                  ) : null}
                </div>
                <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
                  <Button
                    id="branch-production-planned-quantity"
                    type="button"
                    variant="outline"
                    size="touch"
                    className="justify-between font-mono tabular-nums"
                    disabled={isPending}
                    onClick={() => setNumberPadTarget({ kind: "planned" })}
                  >
                    <span>
                      {hasValidPlannedQuantity
                        ? formatQty(plannedQuantityNumber)
                        : "Nhập số lượng…"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {selectedOutputUnitName ?? "Đơn vị"}
                    </span>
                  </Button>
                  {outputUnits.length > 0 ? (
                    <Select
                      value={selectedOutputUnit?.unitId.toString()}
                      onValueChange={(value) => {
                        const nextUnitId = Number.parseInt(value, 10);
                        setEntryUnitId(
                          nextUnitId ===
                            outputUnits.find((unit) => unit.isBase)?.unitId
                            ? undefined
                            : nextUnitId,
                        );
                      }}
                    >
                      <SelectTrigger size="touch" aria-label="Đơn vị sản lượng">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {outputUnits.map((unit) => (
                          <SelectItem
                            key={unit.unitId}
                            value={String(unit.unitId)}
                            size="touch"
                          >
                            {unit.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="branch-production-actual-quantity">
                    Thực ra
                  </Label>
                  <Button
                    id="branch-production-actual-quantity"
                    type="button"
                    variant="outline"
                    size="touch"
                    className="justify-between font-mono tabular-nums"
                    disabled={isPending}
                    onClick={() => setNumberPadTarget({ kind: "actual" })}
                  >
                    <span>
                      {hasValidActualQuantity
                        ? formatQty(actualQuantityNumber)
                        : "Nhập số lượng…"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {selectedOutputUnitName ?? "Đơn vị"}
                    </span>
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Định làm tính nguyên liệu; thực ra tính giá vốn thành phẩm.
                </p>
                {maxProductionInSelectedUnit != null ? (
                  <p className="text-sm text-muted-foreground">
                    Có thể sản xuất tối đa{" "}
                    {formatQty(maxProductionInSelectedUnit)}{" "}
                    {selectedOutputUnitName} theo tồn hiện tại.
                  </p>
                ) : null}
              </div>
            </BranchOperatorPanel>

            {hasLocationChoices ? (
              <BranchOperatorPanel
                title="Kho"
                icon={IconMapPin}
                size="sm"
                contentClassName={
                  hasSourceLocationChoice && hasTargetLocationChoice
                    ? "grid gap-3 sm:grid-cols-2"
                    : "grid gap-3"
                }
              >
                {hasSourceLocationChoice ? (
                  <div className="grid gap-2">
                    <Label htmlFor="branch-production-source-location">
                      Xuất nguyên liệu từ
                    </Label>
                    <Select
                      value={sourceLocationId?.toString()}
                      onValueChange={(value) =>
                        setSourceLocationId(Number.parseInt(value, 10))
                      }
                    >
                      <SelectTrigger
                        id="branch-production-source-location"
                        size="touch"
                      >
                        <SelectValue placeholder="Chọn nơi xuất" />
                      </SelectTrigger>
                      <SelectContent>
                        {sourceLocations.map((location) => (
                          <SelectItem
                            key={location.id}
                            value={String(location.id)}
                            size="touch"
                          >
                            {locationKindLabel(location)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                {hasTargetLocationChoice ? (
                  <div className="grid gap-2">
                    <Label htmlFor="branch-production-target-location">
                      Nhập thành phẩm vào
                    </Label>
                    <Select
                      value={targetLocationId?.toString()}
                      onValueChange={handleTargetLocationChange}
                    >
                      <SelectTrigger
                        id="branch-production-target-location"
                        size="touch"
                      >
                        <SelectValue placeholder="Chọn nơi nhận" />
                      </SelectTrigger>
                      <SelectContent>
                        {targetLocations.map((location) => (
                          <SelectItem
                            key={location.id}
                            value={String(location.id)}
                            size="touch"
                          >
                            {locationLabel(location)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </BranchOperatorPanel>
            ) : null}

            <BranchOperatorPanel title="Ghi chú" size="sm">
              <Label htmlFor="branch-production-notes" className="sr-only">
                Ghi chú ca sản xuất
              </Label>
              <Textarea
                id="branch-production-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Ghi chú cho ca sản xuất…"
                rows={3}
              />
            </BranchOperatorPanel>
          </div>

          <BranchOperatorPanel
            title="Định mức nguyên liệu"
            description="Điền theo định mức rồi chỉ sửa khi thực chi khác."
            icon={IconBoxes}
            size="sm"
            className="min-w-0"
            contentClassName="gap-2"
          >
            {isLoadingContext ? (
              <BranchOperatorInlineState
                tone="info"
                title="Đang kiểm tra định mức…"
                description="Tồn khả dụng và lượng cần dùng đang được cập nhật."
              />
            ) : recipeContextError ? (
              <Alert variant="destructive">
                <AlertTitle>Chưa thể kiểm tra định mức</AlertTitle>
                <AlertDescription>{recipeContextError}</AlertDescription>
              </Alert>
            ) : !finishedGoodId ? (
              <BranchOperatorInlineState
                title="Chọn thành phẩm trước"
                description="Bếp sẽ thấy nguyên liệu và lượng cần dùng ngay tại đây."
              />
            ) : recipeContext?.ingredients.length ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  className="self-start"
                  disabled={isPending || plannedOutputBaseQuantity == null}
                  onClick={handleApplyRecipeDefaults}
                >
                  Đúng định mức
                </Button>
                <ItemGroup className="gap-2" role="list">
                  {recipeContext.ingredients.map((ingredient) => (
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
                            Cần {neededQuantity(ingredient)} · Có thể dùng tối
                            đa {formatQty(ingredient.max_ingredient_qty)}{" "}
                            {ingredient.unit_name}
                          </ItemDescription>
                        </ItemContent>
                        <div className="grid min-w-0 gap-1 sm:w-48 sm:shrink-0">
                          <Label
                            htmlFor={`branch-production-ingredient-${ingredient.ingredient_id}`}
                            className="text-xs"
                          >
                            Thực dùng
                          </Label>
                          <div className="flex min-w-0 items-center gap-2">
                            <Button
                              id={`branch-production-ingredient-${ingredient.ingredient_id}`}
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
              </>
            ) : (
              <BranchOperatorInlineState
                tone="warning"
                title="Thành phẩm chưa có công thức"
                description="Nhờ Chủ cửa hàng cập nhật Công thức trước để kho trừ nguyên liệu đúng."
              />
            )}
          </BranchOperatorPanel>
        </div>

        <AppDetailFooter
          sticky
          leading={
            <Button
              type="button"
              variant="outline"
              size="touch"
              disabled={isPending}
              onClick={() => router.push(basePath)}
            >
              Hủy
            </Button>
          }
          trailing={
            <Button
              type="button"
              size="touch-lg"
              disabled={isPending || !canRecordProductionRun}
              onClick={handleRecord}
            >
              {isPending ? "Đang ghi nhận…" : "Ghi nhận mẻ"}
            </Button>
          }
        />

        <NumberPadSheet
          open={numberPadTarget != null}
          onOpenChange={(open) => {
            if (!open) setNumberPadTarget(null);
          }}
          title={
            numberPadTarget?.kind === "planned"
              ? "Định làm"
              : numberPadTarget?.kind === "actual"
                ? "Thực ra"
                : `Thực dùng: ${numberPadTarget?.name ?? ""}`
          }
          suffix={
            numberPadTarget?.kind === "ingredient"
              ? numberPadTarget.unit
              : selectedOutputUnitName
          }
          initialValue={
            numberPadTarget?.kind === "planned"
              ? plannedQuantityNumber
              : numberPadTarget?.kind === "actual"
                ? actualQuantityNumber
                : numberPadTarget?.kind === "ingredient"
                  ? Number.parseFloat(
                      ingredientUsages[numberPadTarget.ingredientId] ?? "",
                    )
                  : null
          }
          confirmLabel="Xong"
          maxFractionDigits={3}
          onConfirm={(value) => {
            if (numberPadTarget?.kind === "planned") {
              setPlannedQuantity(formatDecimalInputValue(value, 3));
              return;
            }
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
          <SheetContent
            side="bottom"
            className="data-[side=bottom]:h-dvh data-[side=bottom]:max-h-dvh flex flex-col overflow-hidden"
          >
            <SheetHeader>
              <SheetTitle>Thiếu nguyên liệu</SheetTitle>
              <p className="text-sm text-muted-foreground">
                Sửa thực chi rồi ghi nhận lại mẻ này.
              </p>
            </SheetHeader>
            <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
              <ItemGroup className="gap-2">
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
            </div>
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
