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
import { toast } from "@comtammatu/ui/components/sonner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { Combobox } from "@/components/form/combobox";
import { QuantityInput } from "@/components/form/domain-number-inputs";
import { AppDetailFooter } from "@/components/surface";
import {
  BranchOperatorControlBar,
  BranchOperatorInlineState,
  BranchOperatorPage,
  BranchOperatorPanel,
  BranchOperatorStatusStrip,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  createProductionRun,
  fetchProductionRecipeContext,
  type ProductionRecipeIngredient,
} from "@/(protected)/inventory/production-run-actions";
import { tTerm } from "@/(protected)/inventory/_lib/dictionary";
import { formatQty } from "@/(protected)/inventory/_lib/format";
import { getIngredientUnitOptions } from "@/(protected)/inventory/_lib/unit-options";
import {
  productionQuantityFromBase,
  productionQuantityToBase,
} from "@/(protected)/inventory/_lib/production-unit-conversion";
import type {
  BranchOption,
  FinishedGoodOption,
  InventoryLocationOption,
} from "@/(protected)/inventory/production-types";

interface BranchProductionNewClientProps {
  branchId: number;
  branches: BranchOption[];
  locations: InventoryLocationOption[];
  finishedGoods: FinishedGoodOption[];
  basePath: string;
}

function locationKindLabel(location: InventoryLocationOption) {
  if (location.branchKind === "branch" && location.kind === "kitchen") {
    return tTerm("branchKitchen", "button");
  }
  if (location.branchKind === "branch" && location.kind === "warehouse") {
    return tTerm("branchWarehouse", "button");
  }
  if (
    location.branchKind === "central_kitchen" &&
    location.kind === "production_storage"
  ) {
    return tTerm("productionStorage", "button");
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
    candidates.find(
      (location) =>
        location.branchKind === "central_kitchen" &&
        location.kind === "warehouse",
    ) ??
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
    candidates.find(
      (location) =>
        location.branchKind === "central_kitchen" &&
        location.kind === "production_storage",
    ) ??
    candidates.find((location) => location.isDefaultReceive) ??
    candidates[0]
  );
}

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
  const hasValidPlannedQuantity =
    !Number.isNaN(plannedQuantityNumber) && plannedQuantityNumber > 0;
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
  const canCreateProductionRun =
    sourceLocationId != null &&
    targetBranchId != null &&
    targetLocationId != null &&
    finishedGoodId != null &&
    hasValidPlannedQuantity &&
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
    const nextUsages: Record<number, string> = {};
    for (const ingredient of recipeContext?.ingredients ?? []) {
      const defaultQuantity =
        plannedOutputBaseQuantity != null && ingredient.default_usage_per_fg > 0
          ? plannedOutputBaseQuantity * ingredient.default_usage_per_fg
          : null;
      nextUsages[ingredient.ingredient_id] =
        defaultQuantity == null
          ? ""
          : formatDecimalInputValue(defaultQuantity, 3);
    }
    setIngredientUsages(nextUsages);
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

  function handleSave() {
    if (!canCreateProductionRun || finishedGoodId == null) {
      toast.error(
        "Cần hoàn tất thông tin và kiểm tra định mức trước khi tạo lệnh.",
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
      const result = await createProductionRun({
        branchId: routeBranchId,
        finishedGoodId,
        plannedQuantity: plannedQuantityNumber,
        entryUnitId: entryUnitId || undefined,
        notes,
        targetBranchId,
        sourceLocationId,
        targetLocationId,
        ingredientsOverride:
          ingredientsOverride.length > 0 ? ingredientsOverride : undefined,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Không thể tạo lệnh sản xuất.");
        return;
      }
      toast.success("Đã tạo lệnh sản xuất");
      router.push(`${basePath}/${result.data.productionRunId}`);
    });
  }

  const readinessStep = !finishedGoodId
    ? "1/4"
    : !hasValidPlannedQuantity
      ? "2/4"
      : !hasRecipeContext
        ? "3/4"
        : "4/4";

  return (
    <BranchOperatorPage
      title="Tạo lệnh sản xuất"
      description="Chọn thành phẩm, sản lượng, nơi nhận và kiểm tra nguyên liệu."
      hideHeaderOnMobile
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3 pb-28">
        <BranchOperatorControlBar className="sm:hidden">
          <Button asChild variant="ghost" size="icon-touch">
            <Link href={basePath} aria-label="Quay lại Sản xuất">
              <IconArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Tạo lệnh sản xuất</p>
            <p className="truncate text-xs text-muted-foreground">
              Bước {readinessStep}
            </p>
          </div>
        </BranchOperatorControlBar>

        <BranchOperatorStatusStrip
          items={[
            {
              label: "Tiến độ",
              value: readinessStep,
              mono: true,
            },
            {
              label: "Thành phẩm",
              value: selectedFinishedGood?.name ?? "Chưa chọn",
              muted: selectedFinishedGood == null,
            },
            {
              label: "Nơi nhận",
              value: initialTargetLocation
                ? locationKindLabel(
                    targetLocations.find(
                      (location) => location.id === targetLocationId,
                    ) ?? initialTargetLocation,
                  )
                : "Chưa chọn",
              muted: targetLocationId == null,
            },
          ]}
        />

        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
          <div className="flex min-w-0 flex-col gap-3">
            <BranchOperatorPanel
              title="1. Thành phẩm và sản lượng"
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

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="branch-production-planned-quantity">
                    Số lượng dự kiến
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
                  <QuantityInput
                    id="branch-production-planned-quantity"
                    min="0"
                    maxFractionDigits={3}
                    value={plannedQuantity}
                    onValueChange={setPlannedQuantity}
                    placeholder="Nhập số lượng…"
                  />
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
                          >
                            {unit.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>
                {maxProductionInSelectedUnit != null ? (
                  <p className="text-sm text-muted-foreground">
                    Có thể sản xuất tối đa{" "}
                    {formatQty(maxProductionInSelectedUnit)}{" "}
                    {selectedOutputUnitName} theo tồn hiện tại.
                  </p>
                ) : null}
              </div>
            </BranchOperatorPanel>

            <BranchOperatorPanel
              title="2. Nơi sản xuất và nơi nhận"
              icon={IconMapPin}
              size="sm"
              contentClassName="grid gap-3 sm:grid-cols-2"
            >
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
                      <SelectItem key={location.id} value={String(location.id)}>
                        {locationKindLabel(location)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                      <SelectItem key={location.id} value={String(location.id)}>
                        {locationLabel(location)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </BranchOperatorPanel>

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
            title="3. Định mức nguyên liệu"
            description="Kiểm tra lượng cần dùng trước khi tạo lệnh."
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
                          Cần {neededQuantity(ingredient)} · Có thể dùng tối đa{" "}
                          {formatQty(ingredient.max_ingredient_qty)}{" "}
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
                          <QuantityInput
                            id={`branch-production-ingredient-${ingredient.ingredient_id}`}
                            min="0"
                            maxFractionDigits={3}
                            value={
                              ingredientUsages[ingredient.ingredient_id] ?? ""
                            }
                            onValueChange={(value) =>
                              setIngredientUsages((previous) => ({
                                ...previous,
                                [ingredient.ingredient_id]: value,
                              }))
                            }
                            className="min-w-0 text-right"
                          />
                          <span className="w-10 shrink-0 text-xs text-muted-foreground">
                            {ingredient.unit_name}
                          </span>
                        </div>
                      </div>
                    </Item>
                  </div>
                ))}
              </ItemGroup>
            ) : (
              <BranchOperatorInlineState
                tone="warning"
                title="Thành phẩm chưa có công thức"
                description="Cập nhật Công thức trước để kho trừ nguyên liệu đúng."
                actions={
                  <Button asChild size="touch" variant="outline">
                    <Link href={`${basePath}/recipes`}>Mở Công thức</Link>
                  </Button>
                }
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
              disabled={isPending || !canCreateProductionRun}
              onClick={handleSave}
            >
              {isPending ? "Đang tạo…" : "Tạo lệnh sản xuất"}
            </Button>
          }
        />
      </div>
    </BranchOperatorPage>
  );
}
