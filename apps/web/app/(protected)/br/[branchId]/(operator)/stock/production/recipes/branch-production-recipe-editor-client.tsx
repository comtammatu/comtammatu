/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  BookOpen as IconBookOpen,
  Pencil as IconPencil,
  Plus as IconPlus,
  Trash2 as IconTrash,
} from "lucide-react";
import { formatQuantity } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { Input } from "@comtammatu/ui/components/input";
import {
  Item,
  ItemActions,
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
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { toast } from "@comtammatu/ui/components/sonner";
import { Combobox } from "@/components/form/combobox";
import { QuantityInput } from "@/components/form/domain-number-inputs";
import { AppDetailFooter, AppEmptyState } from "@/components/surface";
import {
  BranchOperatorControlBar,
  BranchOperatorPage,
  BranchOperatorPanel,
  BranchOperatorStatusStrip,
} from "@lib/branch-operator/components/branch-operator-page";
import { upsertProductionRecipeLines } from "@/(protected)/inventory/production-actions";
import { getIngredientUnitOptions } from "@/(protected)/inventory/_lib/unit-options";
import type {
  FinishedGoodOption,
  IngredientOption,
  ProductionRecipeRow,
} from "@/(protected)/inventory/production-types";

interface RecipeLineDraft {
  ingredientId: number | null;
  quantity: string;
  entryUnitId: number | null;
  unitLabel: string;
  yieldFactor: string;
  note: string;
}

interface BranchProductionRecipeEditorClientProps {
  branchId: number;
  canManageRecipes: boolean;
  finishedGoods: FinishedGoodOption[];
  ingredients: IngredientOption[];
  usedFinishedGoodIds: number[];
  initialRecipes: ProductionRecipeRow[];
  finishedGoodId?: number;
}

const EMPTY_LINE: RecipeLineDraft = {
  ingredientId: null,
  quantity: "1",
  entryUnitId: null,
  unitLabel: "",
  yieldFactor: "1",
  note: "",
};

function recipeToDraft(recipe: ProductionRecipeRow): RecipeLineDraft {
  return {
    ingredientId: recipe.ingredient_id,
    quantity: String(recipe.quantity),
    entryUnitId: recipe.entry_unit_id,
    unitLabel: recipe.unitLabel,
    yieldFactor: String(recipe.yield_factor),
    note: recipe.note ?? "",
  };
}

export function BranchProductionRecipeEditorClient({
  branchId,
  canManageRecipes,
  finishedGoods,
  ingredients,
  usedFinishedGoodIds,
  initialRecipes,
  finishedGoodId: initialFinishedGoodId,
}: BranchProductionRecipeEditorClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const recipesPath = `/br/${branchId}/stock/production/recipes`;
  const isEditing = initialFinishedGoodId != null;
  const existingFinishedGoodIds = useMemo(
    () => new Set(usedFinishedGoodIds),
    [usedFinishedGoodIds],
  );
  const selectableFinishedGoods = useMemo(
    () =>
      finishedGoods.filter(
        (finishedGood) =>
          finishedGood.id === initialFinishedGoodId ||
          !existingFinishedGoodIds.has(finishedGood.id),
      ),
    [existingFinishedGoodIds, finishedGoods, initialFinishedGoodId],
  );
  const recipeIngredients = useMemo(
    () =>
      ingredients
        .filter(
          (ingredient) =>
            ingredient.item_kind === "raw_material" ||
            ingredient.item_kind === "finished_good",
        )
        .sort((left, right) => left.name.localeCompare(right.name, "vi")),
    [ingredients],
  );
  const [selectedFinishedGoodId, setSelectedFinishedGoodId] = useState<
    number | null
  >(initialFinishedGoodId ?? null);
  const [lines, setLines] = useState<RecipeLineDraft[]>(() =>
    initialRecipes.map(recipeToDraft),
  );
  const [isDirty, setIsDirty] = useState(false);
  const [lineSheetOpen, setLineSheetOpen] = useState(false);
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);
  const [lineDraft, setLineDraft] = useState<RecipeLineDraft>(EMPTY_LINE);

  const selectedFinishedGood = finishedGoods.find(
    (finishedGood) => finishedGood.id === selectedFinishedGoodId,
  );
  const selectedIngredient = recipeIngredients.find(
    (ingredient) => ingredient.id === lineDraft.ingredientId,
  );
  const selectedIngredientUnits = getIngredientUnitOptions(selectedIngredient);
  const availableIngredientOptions = useMemo(() => {
    const selectedIngredientIds = new Set(
      lines.flatMap((line, index) =>
        index === editingLineIndex || line.ingredientId == null
          ? []
          : [line.ingredientId],
      ),
    );
    return recipeIngredients.filter(
      (ingredient) => !selectedIngredientIds.has(ingredient.id),
    );
  }, [editingLineIndex, lines, recipeIngredients]);

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  function openNewLine() {
    setEditingLineIndex(null);
    setLineDraft(EMPTY_LINE);
    setLineSheetOpen(true);
  }

  function openLine(index: number) {
    const line = lines[index];
    if (!line) return;
    setEditingLineIndex(index);
    setLineDraft({ ...line });
    setLineSheetOpen(true);
  }

  function handleIngredientChange(value: string) {
    const ingredientId = Number.parseInt(value, 10);
    const ingredient = recipeIngredients.find(
      (item) => item.id === ingredientId,
    );
    const units = getIngredientUnitOptions(ingredient);
    const defaultUnit = units.find((unit) => unit.isBase) ?? units[0];
    setLineDraft((previous) => ({
      ...previous,
      ingredientId,
      entryUnitId: defaultUnit?.unitId ?? null,
      unitLabel: defaultUnit?.label ?? ingredient?.unit ?? "",
    }));
  }

  function handleLineUnitChange(value: string) {
    const unitId = Number.parseInt(value, 10);
    const unit = selectedIngredientUnits.find((item) => item.unitId === unitId);
    setLineDraft((previous) => ({
      ...previous,
      entryUnitId: unitId,
      unitLabel: unit?.label ?? previous.unitLabel,
    }));
  }

  function saveLine() {
    const quantity = Number.parseFloat(lineDraft.quantity);
    const yieldFactor = Number.parseFloat(lineDraft.yieldFactor);
    if (lineDraft.ingredientId == null) {
      toast.error("Chọn nguyên liệu cho dòng công thức.");
      return;
    }
    if (Number.isNaN(quantity) || quantity <= 0) {
      toast.error("Số lượng nguyên liệu phải lớn hơn 0.");
      return;
    }
    if (Number.isNaN(yieldFactor) || yieldFactor <= 0) {
      toast.error("Hệ số hao hụt phải lớn hơn 0.");
      return;
    }
    if (
      lines.some(
        (line, index) =>
          index !== editingLineIndex &&
          line.ingredientId === lineDraft.ingredientId,
      )
    ) {
      toast.error("Nguyên liệu này đã có trong công thức.");
      return;
    }

    setLines((previous) =>
      editingLineIndex == null
        ? [...previous, { ...lineDraft }]
        : previous.map((line, index) =>
            index === editingLineIndex ? { ...lineDraft } : line,
          ),
    );
    setIsDirty(true);
    setLineSheetOpen(false);
  }

  async function removeLine(index: number) {
    const line = lines[index];
    const ingredient = recipeIngredients.find(
      (item) => item.id === line?.ingredientId,
    );
    const accepted = await confirm({
      title: `Bỏ ${ingredient?.name ?? "nguyên liệu"} khỏi công thức?`,
      description: "Thay đổi chỉ được ghi nhận khi lưu công thức.",
      confirmText: "Bỏ dòng",
      cancelText: "Giữ dòng",
      variant: "destructive",
    });
    if (!accepted) return;
    setLines((previous) =>
      previous.filter((_, lineIndex) => lineIndex !== index),
    );
    setIsDirty(true);
  }

  async function leaveEditor() {
    if (isDirty) {
      const accepted = await confirm({
        title: "Bỏ thay đổi chưa lưu?",
        description: "Các dòng công thức vừa chỉnh sẽ không được ghi nhận.",
        confirmText: "Bỏ thay đổi",
        cancelText: "Tiếp tục chỉnh",
        variant: "destructive",
      });
      if (!accepted) return;
    }
    router.push(recipesPath);
  }

  function handleSaveRecipe() {
    if (!canManageRecipes) return;
    if (selectedFinishedGoodId == null) {
      toast.error("Chọn thành phẩm cần tạo công thức.");
      return;
    }
    if (lines.length === 0) {
      toast.error("Công thức cần ít nhất một nguyên liệu.");
      return;
    }

    startTransition(async () => {
      const result = await upsertProductionRecipeLines({
        finishedGoodId: selectedFinishedGoodId,
        oldFinishedGoodId: initialFinishedGoodId,
        lines: lines.map((line) => ({
          ingredientId: line.ingredientId ?? 0,
          quantity: Number.parseFloat(line.quantity),
          entryUnitId: line.entryUnitId,
          yieldFactor: Number.parseFloat(line.yieldFactor),
          note: line.note.trim() || undefined,
        })),
      });
      if (!result.success) {
        toast.error(result.error ?? "Không thể lưu công thức.");
        return;
      }
      setIsDirty(false);
      toast.success(isEditing ? "Đã cập nhật công thức" : "Đã tạo công thức");
      router.push(recipesPath);
      router.refresh();
    });
  }

  return (
    <BranchOperatorPage
      title={isEditing ? "Chỉnh công thức" : "Tạo công thức"}
      description={
        selectedFinishedGood?.name ?? "Chọn thành phẩm và nguyên liệu"
      }
      hideHeaderOnMobile
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3 pb-28">
        <BranchOperatorControlBar className="sm:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon-touch"
            aria-label="Quay lại danh sách công thức"
            onClick={leaveEditor}
          >
            <IconArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {isEditing ? "Chỉnh công thức" : "Tạo công thức"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {selectedFinishedGood?.name ?? "Chưa chọn thành phẩm"}
            </p>
          </div>
        </BranchOperatorControlBar>

        <BranchOperatorStatusStrip
          items={[
            {
              label: "Thành phẩm",
              value: selectedFinishedGood?.name ?? "Chưa chọn",
              muted: selectedFinishedGood == null,
            },
            {
              label: "Nguyên liệu",
              value: lines.length,
              mono: true,
            },
            {
              label: "Trạng thái",
              value: isDirty ? "Chưa lưu" : isEditing ? "Đã lưu" : "Mới",
              muted: !isDirty,
            },
          ]}
        />

        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(17rem,0.72fr)_minmax(0,1.28fr)] lg:items-start">
          <BranchOperatorPanel title="Thành phẩm" icon={IconBookOpen} size="sm">
            <div className="grid gap-2">
              <Label htmlFor="branch-recipe-finished-good">Thành phẩm</Label>
              <Combobox
                id="branch-recipe-finished-good"
                options={selectableFinishedGoods.map((finishedGood) => ({
                  value: String(finishedGood.id),
                  label: finishedGood.name,
                }))}
                value={
                  selectedFinishedGoodId ? String(selectedFinishedGoodId) : ""
                }
                onValueChange={(value) => {
                  setSelectedFinishedGoodId(
                    value ? Number.parseInt(value, 10) : null,
                  );
                  setIsDirty(true);
                }}
                placeholder="Chọn thành phẩm…"
                size="touch"
                disabled={isEditing || !canManageRecipes}
              />
              {!isEditing && selectableFinishedGoods.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Tất cả thành phẩm hiện đã có công thức.
                </p>
              ) : null}
            </div>
          </BranchOperatorPanel>

          <BranchOperatorPanel
            title="Định mức nguyên liệu"
            description="Chạm một dòng để chỉnh số lượng, đơn vị và hao hụt."
            size="sm"
            className="min-w-0"
            action={
              canManageRecipes ? (
                <Button type="button" size="touch" onClick={openNewLine}>
                  <IconPlus data-icon="inline-start" />
                  Thêm nguyên liệu
                </Button>
              ) : undefined
            }
            contentClassName="gap-2"
          >
            {lines.length === 0 ? (
              <AppEmptyState
                compact
                align="start"
                mode="no-data"
                title="Chưa có nguyên liệu"
                description="Thêm nguyên liệu đầu tiên để hoàn thành định mức."
              >
                {canManageRecipes ? (
                  <Button type="button" size="touch" onClick={openNewLine}>
                    Thêm nguyên liệu đầu tiên
                  </Button>
                ) : null}
              </AppEmptyState>
            ) : (
              <ItemGroup className="gap-2" role="list">
                {lines.map((line, index) => {
                  const ingredient = recipeIngredients.find(
                    (item) => item.id === line.ingredientId,
                  );
                  return (
                    <Item
                      key={`${line.ingredientId ?? "new"}-${index}`}
                      role="listitem"
                      variant="outline"
                      className="min-h-20 items-center touch-manipulation"
                    >
                      <ItemContent className="min-w-0 gap-1">
                        <ItemTitle className="line-clamp-none text-sm font-semibold">
                          {ingredient?.name ?? "Nguyên liệu"}
                        </ItemTitle>
                        <ItemDescription className="line-clamp-none">
                          {formatQuantity(Number(line.quantity))}{" "}
                          {line.unitLabel} · Hao hụt ×{" "}
                          {formatQuantity(Number(line.yieldFactor))}
                          {line.note ? ` · ${line.note}` : ""}
                        </ItemDescription>
                      </ItemContent>
                      {canManageRecipes ? (
                        <ItemActions className="shrink-0 gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-touch"
                            aria-label={`Chỉnh ${ingredient?.name ?? "nguyên liệu"}`}
                            onClick={() => openLine(index)}
                          >
                            <IconPencil />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-touch"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            aria-label={`Bỏ ${ingredient?.name ?? "nguyên liệu"}`}
                            onClick={() => removeLine(index)}
                          >
                            <IconTrash />
                          </Button>
                        </ItemActions>
                      ) : null}
                    </Item>
                  );
                })}
              </ItemGroup>
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
              onClick={leaveEditor}
            >
              Hủy
            </Button>
          }
          trailing={
            canManageRecipes ? (
              <Button
                type="button"
                size="touch-lg"
                disabled={
                  isPending ||
                  selectedFinishedGoodId == null ||
                  lines.length === 0
                }
                onClick={handleSaveRecipe}
              >
                {isPending ? "Đang lưu…" : "Lưu công thức"}
              </Button>
            ) : null
          }
        />

        <Sheet open={lineSheetOpen} onOpenChange={setLineSheetOpen}>
          <SheetContent
            side="bottom"
            className="max-h-dvh-95 overflow-hidden p-0 sm:!inset-y-0 sm:!right-0 sm:!left-auto sm:h-full sm:max-h-none sm:w-full sm:max-w-lg sm:!border-t-0 sm:!border-l"
          >
            <SheetHeader>
              <SheetTitle>
                {editingLineIndex == null
                  ? "Thêm nguyên liệu"
                  : "Chỉnh nguyên liệu"}
              </SheetTitle>
              <SheetDescription>
                Khai báo lượng dùng cho một đơn vị thành phẩm.
              </SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-4 sm:px-4">
              <div className="grid gap-2">
                <Label htmlFor="branch-recipe-line-ingredient">
                  Nguyên liệu
                </Label>
                <Combobox
                  id="branch-recipe-line-ingredient"
                  options={availableIngredientOptions.map((ingredient) => ({
                    value: String(ingredient.id),
                    label: ingredient.name,
                  }))}
                  value={
                    lineDraft.ingredientId ? String(lineDraft.ingredientId) : ""
                  }
                  onValueChange={handleIngredientChange}
                  placeholder="Chọn nguyên liệu…"
                  size="touch"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="branch-recipe-line-quantity">Số lượng</Label>
                  <QuantityInput
                    id="branch-recipe-line-quantity"
                    className="h-11"
                    min="0"
                    maxFractionDigits={3}
                    value={lineDraft.quantity}
                    onValueChange={(value) =>
                      setLineDraft((previous) => ({
                        ...previous,
                        quantity: value,
                      }))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="branch-recipe-line-unit">Đơn vị</Label>
                  <Select
                    value={
                      lineDraft.entryUnitId == null
                        ? undefined
                        : String(lineDraft.entryUnitId)
                    }
                    onValueChange={handleLineUnitChange}
                  >
                    <SelectTrigger id="branch-recipe-line-unit" size="touch">
                      <SelectValue placeholder="Chọn đơn vị" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedIngredientUnits.map((unit) => (
                        <SelectItem
                          key={unit.unitId}
                          value={String(unit.unitId)}
                        >
                          {unit.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="branch-recipe-line-yield">Hệ số hao hụt</Label>
                <QuantityInput
                  id="branch-recipe-line-yield"
                  className="h-11"
                  min="0"
                  maxFractionDigits={3}
                  value={lineDraft.yieldFactor}
                  onValueChange={(value) =>
                    setLineDraft((previous) => ({
                      ...previous,
                      yieldFactor: value,
                    }))
                  }
                />
                <p className="text-sm text-muted-foreground">
                  Dùng 1 khi không cần bù hao hụt.
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="branch-recipe-line-note">Ghi chú</Label>
                <Input
                  id="branch-recipe-line-note"
                  className="h-11"
                  value={lineDraft.note}
                  onChange={(event) =>
                    setLineDraft((previous) => ({
                      ...previous,
                      note: event.target.value,
                    }))
                  }
                  placeholder="Ghi chú cho dòng nguyên liệu…"
                  autoComplete="off"
                />
              </div>
            </div>
            <SheetFooter className="flex-row justify-end">
              <Button
                type="button"
                variant="outline"
                size="touch"
                onClick={() => setLineSheetOpen(false)}
              >
                Hủy
              </Button>
              <Button type="button" size="touch-lg" onClick={saveLine}>
                Lưu dòng
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
    </BranchOperatorPage>
  );
}
