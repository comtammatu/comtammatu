/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  embedded?: boolean;
}

const productionCopy = messages.inventory.operatorFlow;

function locationLabel(location: InventoryLocationOption) {
  const kind =
    location.kind === "production_storage" ? "Kho sản xuất" : "Kho Bếp TT";
  return `${location.branchName} · ${kind}`;
}

export function ProductionNewClient({
  branches,
  locations,
  finishedGoods,
  initialBranchId,
  basePath,
  embedded = false,
}: ProductionNewClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const initialBranch =
    branches.find((branch) => branch.id === initialBranchId) ?? branches[0];
  const [branchId, setBranchId] = useState<number | undefined>(initialBranch?.id);
  const [sourceLocationId, setSourceLocationId] = useState<number | undefined>();
  const [targetLocationId, setTargetLocationId] = useState<number | undefined>();
  const [recipeSpecId, setRecipeSpecId] = useState<number | undefined>();
  const [plannedQuantity, setPlannedQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [context, setContext] = useState<{
    ingredients: ProductionRecipeIngredient[];
    maxProductionQuantity: number | null;
  } | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);

  const branchLocations = useMemo(
    () => locations.filter((location) => location.branchId === branchId),
    [branchId, locations],
  );
  const sourceLocations = branchLocations.filter(
    (location) => location.kind === "warehouse",
  );
  const targetLocations = branchLocations.filter(
    (location) =>
      location.kind === "warehouse" || location.kind === "production_storage",
  );
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

  useEffect(() => {
    const scopedSources = locations.filter(
      (location) =>
        location.branchId === branchId && location.kind === "warehouse",
    );
    const defaultSource =
      scopedSources.find((location) => location.isDefaultConsumption) ??
      scopedSources[0];
    setSourceLocationId(defaultSource?.id);
    setTargetLocationId(defaultSource?.id);
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
      toast.error("Kiểm tra công thức, sản lượng và vị trí trước khi tạo lệnh.");
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
        title="Bếp và vị trí sản xuất"
        description="Nguyên liệu và thành phẩm phải được ghi tại cùng một Bếp Trung Tâm."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="grid gap-2">
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
          <div className="grid gap-2">
            <Label htmlFor="production-source">Nơi xuất nguyên liệu</Label>
            <Select
              value={sourceLocationId?.toString()}
              onValueChange={(value) => setSourceLocationId(Number(value))}
            >
              <SelectTrigger id="production-source">
                <SelectValue placeholder="Chọn kho xuất" />
              </SelectTrigger>
              <SelectContent>
                {sourceLocations.map((location) => (
                  <SelectItem key={location.id} value={String(location.id)}>
                    {locationLabel(location)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="production-target">Nơi nhập thành phẩm</Label>
            <Select
              value={targetLocationId?.toString()}
              onValueChange={(value) => setTargetLocationId(Number(value))}
            >
              <SelectTrigger id="production-target">
                <SelectValue placeholder="Chọn kho nhập" />
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
        </div>
      </AppSection>

      <AppSection
        title="Kế hoạch sản xuất"
        description="Lệnh lấy đơn vị và định mức từ công thức đang dùng."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-2">
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
                value={plannedQuantity}
                onValueChange={setPlannedQuantity}
                min="0"
                maxFractionDigits={3}
              />
              <span className="shrink-0 text-sm text-muted-foreground">
                {selectedRecipe?.outputUnitLabel ?? "Đơn vị công thức"}
              </span>
            </div>
          </div>
        </div>
      </AppSection>

      <AppSection
        title="Nguyên liệu kế hoạch"
        description="Số liệu này được chốt theo lệnh và chỉ nhập thực tế khi hoàn thành."
      >
        {loadingContext ? (
          <p className="text-sm text-muted-foreground">
            {productionCopy.productionRecipeLoading}
          </p>
        ) : contextError ? (
          <AppEmptyState mode="error" title="Chưa thể tạo lệnh" description={contextError} />
        ) : context?.ingredients.length ? (
          <div className="divide-y border">
            {context.ingredients.map((ingredient) => (
              <div
                key={ingredient.ingredient_id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="font-medium">{ingredient.ingredient_name}</span>
                <span>
                  {batchRatio == null
                    ? "—"
                    : formatQty(batchRatio * ingredient.recipe_quantity)}{" "}
                  {ingredient.unit_name}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Chọn công thức để xem nguyên liệu.
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
      sticky={embedded}
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
        embedded ? null : (
          <AppPageHeader
            title="Tạo Lệnh sản xuất"
            description="Tạo lệnh nháp từ một công thức đã duyệt."
            breadcrumb={<AppBackLink href={basePath}>Quay lại</AppBackLink>}
          />
        )
      }
      footer={footer}
    >
      {body}
    </DocumentFormFrame>
  );
}
