/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@comtammatu/ui/components/sonner";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemContent,
  ItemDescription,
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
import { Textarea } from "@comtammatu/ui/components/textarea";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
import { Combobox } from "@/components/form/combobox";
import {
  AppBackLink,
  AppDetailFooter,
  AppEmptyState,
  AppPageHeader,
  AppSection,
  DocumentFormFrame,
} from "@/components/surface";
import { QuantityInput } from "@/components/form/domain-number-inputs";
import {
  createProductionRun,
  fetchProductionRecipeContext,
  type ProductionRecipeIngredient,
} from "../../production-run-actions";
import { tRoute, tTerm } from "../../_lib/dictionary";
import { messages } from "@lib/messages";
import { getIngredientUnitOptions } from "@lib/inventory/unit-options";
import {
  productionQuantityFromBase,
  productionQuantityToBase,
} from "../../_lib/production-unit-conversion";
import type {
  BranchOption,
  FinishedGoodOption,
  InventoryLocationOption,
} from "../../production-types";
import { formatQty } from "@lib/inventory/format";
import { formatDecimalInputValue } from "@comtammatu/shared/format";
import { INVENTORY_VI } from "@comtammatu/shared/messages";

interface ProductionNewClientProps {
  branches: BranchOption[];
  targetBranches: BranchOption[];
  locations: InventoryLocationOption[];
  finishedGoods: FinishedGoodOption[];
  initialBranchId?: number;
  basePath: string;
  embedded?: boolean;
}

function locationKindLabel(location: InventoryLocationOption) {
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
  return `${location.branchName} - ${locationKindLabel(location)}`;
}

function pickSourceLocation(
  locations: InventoryLocationOption[],
  branchId: number | undefined,
) {
  const candidates = branchId
    ? locations.filter((location) => location.branchId === branchId)
    : locations;
  return (
    candidates.find(
      (location) =>
        location.branchKind === "branch" && location.kind === "warehouse",
    ) ??
    candidates.find(
      (location) =>
        location.branchKind === "central_kitchen" &&
        location.kind === "production_storage",
    ) ??
    candidates.find((location) => location.isDefaultConsumption) ??
    candidates.find((location) => location.isDefaultReceive) ??
    candidates[0]
  );
}

function pickTargetLocation(
  locations: InventoryLocationOption[],
  branchId: number | undefined,
) {
  const candidates = branchId
    ? locations.filter((location) => location.branchId === branchId)
    : locations;
  return (
    candidates.find(
      (location) =>
        location.branchKind === "branch" && location.kind === "warehouse",
    ) ??
    candidates.find((location) => location.isDefaultReceive) ??
    candidates[0]
  );
}

export function ProductionNewClient({
  branches,
  targetBranches,
  locations,
  finishedGoods,
  initialBranchId,
  basePath,
  embedded = false,
}: ProductionNewClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const productionBranchIds = new Set(branches.map((branch) => branch.id));
  const targetBranchIds = new Set(targetBranches.map((branch) => branch.id));
  const sourceLocations = locations.filter((location) =>
    productionBranchIds.has(location.branchId),
  );
  const targetLocations = locations.filter((location) =>
    targetBranchIds.has(location.branchId),
  );
  const initialSourceLocation = pickSourceLocation(
    sourceLocations,
    initialBranchId ?? branches[0]?.id,
  );
  const initialTargetLocation = pickTargetLocation(
    targetLocations,
    initialBranchId ?? initialSourceLocation?.branchId ?? targetBranches[0]?.id,
  );

  const [branchId, setBranchId] = useState<number | undefined>(
    initialSourceLocation?.branchId ?? initialBranchId ?? branches[0]?.id,
  );
  const [sourceLocationId, setSourceLocationId] = useState<number | undefined>(
    initialSourceLocation?.id,
  );
  const [targetBranchId, setTargetBranchId] = useState<number | undefined>(
    initialTargetLocation?.branchId ?? initialBranchId ?? targetBranches[0]?.id,
  );
  const [targetLocationId, setTargetLocationId] = useState<number | undefined>(
    initialTargetLocation?.id,
  );
  const [finishedGoodId, setFinishedGoodId] = useState<number | undefined>();
  const [plannedQuantity, setPlannedQuantity] = useState<string>("");
  const [entryUnitId, setEntryUnitId] = useState<number | undefined>();
  const [notes, setNotes] = useState<string>("");

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

  const selectedFg = finishedGoods.find((fg) => fg.id === finishedGoodId);
  const unitOptions = getIngredientUnitOptions(selectedFg, {
    includeToBaseFactor: true,
  });
  const selectedOutputUnit =
    entryUnitId == null
      ? unitOptions.find((unit) => unit.isBase)
      : unitOptions.find((unit) => unit.unitId === entryUnitId);
  const selectedOutputUnitName = selectedOutputUnit?.label ?? selectedFg?.unit;
  const selectedOutputToBaseFactor = selectedOutputUnit?.toBaseFactor;
  const canUseRecipeControls =
    branchId != null && sourceLocationId != null && finishedGoodId != null;
  const plannedQtyParsed = Number.parseFloat(plannedQuantity);
  const hasValidPlannedQty =
    !Number.isNaN(plannedQtyParsed) && plannedQtyParsed > 0;
  const plannedOutputBaseQuantity = hasValidPlannedQty
    ? productionQuantityToBase(plannedQtyParsed, selectedOutputToBaseFactor)
    : null;
  const maxProductionInSelectedUnit = productionQuantityFromBase(
    recipeContext?.maxProductionQuantity ?? Number.NaN,
    selectedOutputToBaseFactor,
  );
  const hasRecipeContext =
    recipeContext != null && recipeContext.ingredients.length > 0;
  const canCreateProductionRun =
    branchId != null &&
    sourceLocationId != null &&
    targetBranchId != null &&
    targetLocationId != null &&
    finishedGoodId != null &&
    hasValidPlannedQty &&
    plannedOutputBaseQuantity != null &&
    hasRecipeContext &&
    !isLoadingContext &&
    recipeContextError == null;
  const controlSize = embedded ? "touch" : "default";

  useEffect(() => {
    if (branchId && sourceLocationId && finishedGoodId) {
      let active = true;
      setIsLoadingContext(true);
      setRecipeContext(null);
      setRecipeContextError(null);
      fetchProductionRecipeContext(finishedGoodId, branchId, sourceLocationId)
        .then((res) => {
          if (!active) return;
          if (res.success && res.data) {
            setRecipeContext(res.data);
          } else {
            setRecipeContext(null);
            setRecipeContextError(
              res.error ?? "Không thể kiểm tra định mức và tồn kho.",
            );
          }
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
    } else {
      setRecipeContext(null);
      setRecipeContextError(null);
      setIsLoadingContext(false);
    }
  }, [branchId, sourceLocationId, finishedGoodId]);

  useEffect(() => {
    if (recipeContext?.ingredients) {
      const usages: Record<number, string> = {};
      for (const ing of recipeContext.ingredients) {
        if (plannedOutputBaseQuantity != null && ing.default_usage_per_fg > 0) {
          const defaultQty =
            plannedOutputBaseQuantity * ing.default_usage_per_fg;
          usages[ing.ingredient_id] = formatDecimalInputValue(defaultQty, 3);
        } else {
          usages[ing.ingredient_id] = "";
        }
      }
      setIngredientUsages(usages);
    }
  }, [recipeContext, plannedOutputBaseQuantity]);

  const handleSetMaxQuantity = () => {
    if (maxProductionInSelectedUnit != null) {
      setPlannedQuantity(
        formatDecimalInputValue(maxProductionInSelectedUnit, 3),
      );
    } else {
      toast.error(
        "Không thể tính toán số lượng tối đa (có thể kho đang trống)",
      );
    }
  };

  const handleIngredientChange = (id: number, val: string) => {
    setIngredientUsages((prev) => ({ ...prev, [id]: val }));
  };

  const handleSourceLocationChange = (value: string) => {
    const nextId = Number.parseInt(value, 10);
    const nextLocation = sourceLocations.find(
      (location) => location.id === nextId,
    );
    setSourceLocationId(nextId);
    if (nextLocation) {
      setBranchId(nextLocation.branchId);
    }
  };

  const handleTargetLocationChange = (value: string) => {
    const nextId = Number.parseInt(value, 10);
    const nextLocation = targetLocations.find(
      (location) => location.id === nextId,
    );
    setTargetLocationId(nextId);
    if (nextLocation) {
      setTargetBranchId(nextLocation.branchId);
    }
  };

  const handleSave = () => {
    if (
      !branchId ||
      !sourceLocationId ||
      !targetBranchId ||
      !targetLocationId ||
      !finishedGoodId ||
      !plannedQuantity
    ) {
      toast.error("Vui lòng điền đầy đủ thông tin bắt buộc");
      return;
    }

    const parsedQty = Number.parseFloat(plannedQuantity);
    if (Number.isNaN(parsedQty) || parsedQty <= 0) {
      toast.error("Số lượng phải lớn hơn 0");
      return;
    }

    if (!canCreateProductionRun) {
      toast.error("Cần kiểm tra định mức và tồn kho trước khi tạo lệnh.");
      return;
    }

    const ingredientsOverride: {
      ingredient_id: number;
      actual_quantity: number;
    }[] = [];
    if (recipeContext?.ingredients) {
      for (const ing of recipeContext.ingredients) {
        const val = ingredientUsages[ing.ingredient_id];
        if (val) {
          const num = Number.parseFloat(val);
          if (!Number.isNaN(num) && num >= 0) {
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
        targetBranchId,
        sourceLocationId,
        targetLocationId,
        ingredientsOverride:
          ingredientsOverride.length > 0 ? ingredientsOverride : undefined,
      });

      if (res.success) {
        if (!res.data) {
          toast.error("Có lỗi xảy ra");
          return;
        }
        toast.success("Tạo lệnh sản xuất thành công");
        router.push(`${basePath}/${res.data.productionRunId}`);
      } else {
        toast.error(res.error || "Có lỗi xảy ra");
      }
    });
  };

  const renderNeededQuantity = (ingredient: ProductionRecipeIngredient) => {
    if (
      plannedOutputBaseQuantity == null ||
      ingredient.default_usage_per_fg <= 0
    ) {
      return "Nhập sản lượng để xem";
    }

    return `${formatQty(
      plannedOutputBaseQuantity * ingredient.default_usage_per_fg,
    )} ${ingredient.unit_name}`;
  };

  const renderIngredientInput = (ingredient: ProductionRecipeIngredient) => (
    <div className="flex min-w-0 items-center gap-2">
      <QuantityInput
        className="min-w-0 text-right"
        min="0"
        maxFractionDigits={3}
        value={ingredientUsages[ingredient.ingredient_id] ?? ""}
        onValueChange={(value) =>
          handleIngredientChange(ingredient.ingredient_id, value)
        }
      />
      <span className="w-10 shrink-0 text-xs text-muted-foreground">
        {ingredient.unit_name}
      </span>
    </div>
  );

  const ingredientColumns: DataTableColumn<ProductionRecipeIngredient>[] = [
    {
      key: "ingredient",
      header: "Nguyên liệu",
      className: "min-w-48",
      render: (ingredient) => (
        <span className="font-medium">{ingredient.ingredient_name}</span>
      ),
    },
    {
      key: "stock",
      header: "Tồn khả dụng",
      className: "text-right",
      render: (ingredient) => (
        <span className="text-muted-foreground">
          {formatQty(ingredient.max_ingredient_qty)} {ingredient.unit_name}
        </span>
      ),
    },
    {
      key: "needed",
      header: "Cần dùng",
      className: "text-right",
      render: (ingredient) => (
        <span className="font-medium">{renderNeededQuantity(ingredient)}</span>
      ),
    },
    {
      key: "actual",
      header: "Sử dụng thực tế",
      className: "min-w-48",
      render: (ingredient) => renderIngredientInput(ingredient),
    },
  ];

  const body = (
    <>
      <AppSection
        title="Phạm vi sản xuất"
        description="Chọn nơi tiêu hao nguyên liệu và nơi nhập kho thành phẩm sau khi hoàn tất."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="production-source-location">
              Nơi xuất nguyên liệu
            </Label>
            <Select
              value={sourceLocationId?.toString()}
              onValueChange={handleSourceLocationChange}
            >
              <SelectTrigger id="production-source-location" size={controlSize}>
                <SelectValue placeholder="Chọn nơi xuất" />
              </SelectTrigger>
              <SelectContent>
                {sourceLocations.map((location) => (
                  <SelectItem key={location.id} value={location.id.toString()}>
                    {locationLabel(location)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="production-target-location">
              Nơi nhập thành phẩm
            </Label>
            <Select
              value={targetLocationId?.toString()}
              onValueChange={handleTargetLocationChange}
            >
              <SelectTrigger id="production-target-location" size={controlSize}>
                <SelectValue placeholder="Chọn nơi nhập" />
              </SelectTrigger>
              <SelectContent>
                {targetLocations.map((location) => (
                  <SelectItem key={location.id} value={location.id.toString()}>
                    {locationLabel(location)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </AppSection>

      <AppSection
        title="Sản lượng thành phẩm"
        description="Chọn món cần sản xuất, nhập sản lượng dự kiến rồi kiểm tra định mức nguyên liệu."
        action={
          canUseRecipeControls ? (
            <Button
              type="button"
              variant="outline"
              size={embedded ? "touch" : "sm"}
              onClick={handleSetMaxQuantity}
              disabled={isLoadingContext || maxProductionInSelectedUnit == null}
            >
              Tối đa theo tồn
            </Button>
          ) : null
        }
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="production-finished-good">Thành phẩm</Label>
            <Combobox
              id="production-finished-good"
              options={finishedGoods.map((fg) => ({
                value: fg.id.toString(),
                label: fg.name,
              }))}
              value={finishedGoodId?.toString() || ""}
              onValueChange={(val: string) => {
                setFinishedGoodId(val ? Number.parseInt(val, 10) : undefined);
                setEntryUnitId(undefined);
              }}
              placeholder="Chọn thành phẩm..."
              size={controlSize}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="production-planned-quantity">
              Số lượng dự kiến
            </Label>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <QuantityInput
                id="production-planned-quantity"
                min="0"
                maxFractionDigits={3}
                value={plannedQuantity}
                onValueChange={setPlannedQuantity}
                placeholder="Nhập số lượng..."
              />
              {unitOptions.length > 0 && (
                <Select
                  value={selectedOutputUnit?.unitId.toString()}
                  onValueChange={(val) => {
                    const nextUnitId = Number.parseInt(val, 10);
                    setEntryUnitId(
                      nextUnitId ===
                        unitOptions.find((unit) => unit.isBase)?.unitId
                        ? undefined
                        : nextUnitId,
                    );
                  }}
                >
                  <SelectTrigger className="w-full sm:w-36" size={controlSize}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {unitOptions.map((unit) => (
                      <SelectItem
                        key={unit.unitId}
                        value={unit.unitId.toString()}
                      >
                        {unit.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {maxProductionInSelectedUnit != null ? (
              <p className="text-xs text-muted-foreground">
                Tối đa theo tồn hiện tại:{" "}
                <span className="font-medium text-foreground">
                  {formatQty(maxProductionInSelectedUnit)}
                  {selectedOutputUnitName ? ` ${selectedOutputUnitName}` : ""}
                </span>
              </p>
            ) : null}
          </div>
        </div>
      </AppSection>

      {isLoadingContext ? (
        <AppSection title="Định mức nguyên liệu" size="sm" tone="info">
          <p className="text-sm text-muted-foreground">
            {messages.inventory.operatorFlow.productionRecipeLoading}
          </p>
        </AppSection>
      ) : null}

      {!isLoadingContext && recipeContextError ? (
        <Alert variant="destructive">
          <AlertTitle>Chưa thể kiểm tra định mức nguyên liệu</AlertTitle>
          <AlertDescription>{recipeContextError}</AlertDescription>
        </Alert>
      ) : null}

      {!isLoadingContext && recipeContext?.ingredients.length ? (
        <AppSection
          title="Định mức nguyên liệu"
          description="Hệ thống đề xuất lượng cần dùng theo sản lượng dự kiến. Bếp có thể chỉnh lượng thực tế trước khi tạo lệnh."
          contentFlush
        >
          <DataTable
            columns={ingredientColumns}
            data={recipeContext.ingredients}
            getRowKey={(ingredient) => ingredient.ingredient_id}
            emptyTitle="Chưa có nguyên liệu"
            emptyDescription="Thành phẩm này chưa có định mức nguyên liệu."
            mobileCardRender={(ingredient) => (
              <Item variant="outline" size="sm" className="items-start">
                <ItemContent className="basis-full">
                  <ItemTitle>{ingredient.ingredient_name}</ItemTitle>
                  <ItemDescription>
                    Tồn khả dụng: {formatQty(ingredient.max_ingredient_qty)}{" "}
                    {ingredient.unit_name} · Cần dùng:{" "}
                    {renderNeededQuantity(ingredient)}
                  </ItemDescription>
                </ItemContent>
                <div className="grid w-full gap-2">
                  <Label>Sử dụng thực tế</Label>
                  {renderIngredientInput(ingredient)}
                </div>
              </Item>
            )}
          />
        </AppSection>
      ) : null}

      {!isLoadingContext && recipeContext?.ingredients.length === 0 ? (
        <AppSection title="Định mức nguyên liệu">
          <AppEmptyState
            compact
            align="start"
            title="Thành phẩm này chưa có định mức nguyên liệu"
            description="Hãy cập nhật công thức trước khi tạo lệnh sản xuất để kho trừ đúng."
          />
        </AppSection>
      ) : null}

      <AppSection title="Ghi chú">
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Ghi chú thêm..."
          rows={3}
        />
      </AppSection>
    </>
  );

  const footerLeading = (
    <Button
      type="button"
      variant="outline"
      onClick={() => router.push(basePath)}
      disabled={isPending}
      size={embedded ? "touch" : "default"}
    >
      Hủy
    </Button>
  );
  const footerTrailing = (
    <Button
      type="button"
      onClick={handleSave}
      disabled={isPending || !canCreateProductionRun}
      size={embedded ? "touch-lg" : "default"}
    >
      {isPending ? "Đang lưu..." : "Tạo lệnh"}
    </Button>
  );

  const footer = (
    <AppDetailFooter
      sticky={embedded}
      className={embedded ? undefined : "border-0 py-0"}
      leading={footerLeading}
      trailing={footerTrailing}
    />
  );

  if (embedded) {
    return (
      <div className="flex w-full flex-col gap-3">
        <div className="flex flex-col gap-3">{body}</div>
        {footer}
      </div>
    );
  }

  return (
    <DocumentFormFrame
      header={
        <AppPageHeader
          eyebrow={INVENTORY_VI.warehouse}
          title={INVENTORY_VI.createProductionOrder}
          description={INVENTORY_VI.productionOrdersCardDescription}
          breadcrumb={
            <AppBackLink href={basePath}>
              {tRoute("/inventory/production")}
            </AppBackLink>
          }
        />
      }
      width="wide"
      density="compact"
      footer={footer}
    >
      {body}
    </DocumentFormFrame>
  );
}
