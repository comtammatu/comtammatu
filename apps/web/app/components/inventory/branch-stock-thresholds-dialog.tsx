"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Sliders as IconSliders,
  Check as IconCheck,
  Search as IconSearch,
} from "lucide-react";
import { ACTIONS_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { AppDialog } from "@/components/form";
import { useFormControlSize } from "@/components/form/control-size";
import { Frame } from "@comtammatu/ui/components/frame";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import type { BranchStockThresholdRow } from "@lib/inventory/branch-thresholds-data";
import { selectDirtyBranchThresholds } from "@lib/inventory/branch-stock-threshold-model";
import { saveBranchStockThresholdsAction } from "@/(protected)/inventory/stock-actions";

type ThresholdSourceFilter = "all" | "custom" | "global";

const ALL_CATEGORIES = "__all_categories__";

function getUnitLabel(row: BranchStockThresholdRow): string | null {
  return row.baseUnitCode?.trim() || row.baseUnitName?.trim() || null;
}

export function BranchStockThresholdsDialog({
  branchId,
  branchName,
  initialRows,
}: {
  branchId: number;
  branchName?: string | null;
  initialRows: BranchStockThresholdRow[];
}) {
  const controlSize = useFormControlSize();
  const menuItemSize = controlSize === "touch" ? "touch" : "default";
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [thresholdSourceFilter, setThresholdSourceFilter] =
    useState<ThresholdSourceFilter>("all");
  const [rows, setRows] = useState(initialRows);
  const [dirtyIngredientIds, setDirtyIngredientIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [isPending, startTransition] = useTransition();
  const [savedSuccess, setSavedSuccess] = useState(false);

  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .map((row) => row.categoryName?.trim())
            .filter((category): category is string => Boolean(category)),
        ),
      ).sort((a, b) => a.localeCompare(b, "vi")),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const query = search.toLocaleLowerCase("vi").trim();
    return rows.filter((row) => {
      const matchesQuery =
        query === "" ||
        row.ingredientName.toLocaleLowerCase("vi").includes(query) ||
        row.sku?.toLocaleLowerCase("vi").includes(query) ||
        row.categoryName?.toLocaleLowerCase("vi").includes(query);
      const matchesCategory =
        categoryFilter === ALL_CATEGORIES ||
        row.categoryName === categoryFilter;
      const matchesSource =
        thresholdSourceFilter === "all" ||
        (thresholdSourceFilter === "custom" && row.isCustomized) ||
        (thresholdSourceFilter === "global" && !row.isCustomized);

      return matchesQuery && matchesCategory && matchesSource;
    });
  }, [categoryFilter, rows, search, thresholdSourceFilter]);

  const hasActiveFilters =
    search.trim() !== "" ||
    categoryFilter !== ALL_CATEGORIES ||
    thresholdSourceFilter !== "all";

  const handleMinStockChange = (ingredientId: number, val: string) => {
    const num = val === "" ? 0 : Number(val);
    setDirtyIngredientIds((previous) => new Set(previous).add(ingredientId));
    setRows((prev) =>
      prev.map((r) =>
        r.ingredientId === ingredientId
          ? {
              ...r,
              branchMinStock: num,
              effectiveMinStock: num,
              isCustomized: true,
            }
          : r,
      ),
    );
  };

  const handleReorderQtyChange = (ingredientId: number, val: string) => {
    const num = val === "" ? null : Number(val);
    setDirtyIngredientIds((previous) => new Set(previous).add(ingredientId));
    setRows((prev) =>
      prev.map((r) =>
        r.ingredientId === ingredientId
          ? {
              ...r,
              reorderQuantity: num,
              isCustomized: true,
            }
          : r,
      ),
    );
  };

  const handleSave = () => {
    const changedRows = selectDirtyBranchThresholds(rows, dirtyIngredientIds);
    if (changedRows.length === 0) return;

    startTransition(async () => {
      const res = await saveBranchStockThresholdsAction({
        branchId,
        thresholds: changedRows.map((r) => ({
          ingredientId: r.ingredientId,
          minStockLevel: r.effectiveMinStock,
          reorderQuantity: r.reorderQuantity,
        })),
      });

      if (res.success) {
        setDirtyIngredientIds(new Set());
        setSavedSuccess(true);
        setTimeout(() => {
          setSavedSuccess(false);
          setOpen(false);
        }, 1200);
      } else {
        toast.error(INVENTORY_VI.branchThresholdsSaveFailed);
      }
    });
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <IconSliders className="size-4" />
        <span>{INVENTORY_VI.branchThresholdsTitle}</span>
      </Button>

      <AppDialog
        open={open}
        onOpenChange={setOpen}
        title={INVENTORY_VI.branchThresholdsTitle}
        description={`${branchName ? `${branchName} — ` : ""}${INVENTORY_VI.branchThresholdsDescription}`}
        contentClassName="max-w-3xl"
        footer={
          <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-muted-foreground">
              {INVENTORY_VI.branchThresholdsFilterResult(
                filteredRows.length,
                rows.length,
              )}
            </span>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <Button
                variant="outline"
                size={controlSize}
                onClick={() => setOpen(false)}
              >
                {ACTIONS_VI.cancel}
              </Button>
              <Button
                size={controlSize}
                onClick={handleSave}
                disabled={
                  isPending || savedSuccess || dirtyIngredientIds.size === 0
                }
              >
                {savedSuccess ? (
                  <>
                    <IconCheck className="size-4 mr-1 text-success" />
                    <span>{INVENTORY_VI.branchThresholdsSaveSuccess}</span>
                  </>
                ) : isPending ? (
                  INVENTORY_VI.submittingEllipsis
                ) : (
                  ACTIONS_VI.save
                )}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex max-h-dvh-70 flex-col gap-4 overflow-y-auto">
          <div className="flex flex-col gap-2">
            <InputGroup size={controlSize}>
              <InputGroupAddon>
                <IconSearch className="size-4 text-muted-foreground" />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                inputMode="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={INVENTORY_VI.branchThresholdsSearchPlaceholder}
              />
            </InputGroup>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger
                  size={controlSize}
                  className="w-full min-w-0 sm:flex-1"
                  aria-label={INVENTORY_VI.branchThresholdsAllCategories}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CATEGORIES} size={menuItemSize}>
                    {INVENTORY_VI.branchThresholdsAllCategories}
                  </SelectItem>
                  {categories.map((category) => (
                    <SelectItem
                      key={category}
                      value={category}
                      size={menuItemSize}
                    >
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={thresholdSourceFilter}
                onValueChange={(value) =>
                  setThresholdSourceFilter(value as ThresholdSourceFilter)
                }
              >
                <SelectTrigger
                  size={controlSize}
                  className="w-full min-w-0 sm:flex-1"
                  aria-label={INVENTORY_VI.branchThresholdsAllSources}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" size={menuItemSize}>
                    {INVENTORY_VI.branchThresholdsAllSources}
                  </SelectItem>
                  <SelectItem value="custom" size={menuItemSize}>
                    {INVENTORY_VI.branchThresholdsCustomizedBadge}
                  </SelectItem>
                  <SelectItem value="global" size={menuItemSize}>
                    {INVENTORY_VI.branchThresholdsGlobalBadge}
                  </SelectItem>
                </SelectContent>
              </Select>

              {hasActiveFilters ? (
                <Button
                  type="button"
                  variant="ghost"
                  size={controlSize}
                  onClick={() => {
                    setSearch("");
                    setCategoryFilter(ALL_CATEGORIES);
                    setThresholdSourceFilter("all");
                  }}
                >
                  {ACTIONS_VI.clearFilters}
                </Button>
              ) : null}
            </div>

            <p className="text-xs text-muted-foreground" aria-live="polite">
              {INVENTORY_VI.branchThresholdsFilterResult(
                filteredRows.length,
                rows.length,
              )}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {filteredRows.map((row) => {
              const unitLabel = getUnitLabel(row);
              return (
                <Frame
                  key={row.ingredientId}
                  className="flex min-w-0 flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="min-w-0 truncate text-sm font-semibold">
                        {row.ingredientName}
                      </span>
                      <Badge
                        variant={row.isCustomized ? "default" : "secondary"}
                      >
                        {row.isCustomized
                          ? INVENTORY_VI.branchThresholdsCustomizedBadge
                          : INVENTORY_VI.branchThresholdsGlobalBadge}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {row.categoryName || INVENTORY_VI.uncategorized}
                      </span>
                      <span>{row.sku ?? "—"}</span>
                      <span>
                        {unitLabel
                          ? INVENTORY_VI.unitPrefix(unitLabel)
                          : INVENTORY_VI.missingInventoryUnit}
                      </span>
                    </div>
                  </div>

                  <div className="grid shrink-0 grid-cols-2 gap-2 sm:w-80">
                    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
                      <span>{INVENTORY_VI.colMinStockLevel}</span>
                      <InputGroup size={controlSize}>
                        <InputGroupInput
                          type="number"
                          min={0}
                          value={row.effectiveMinStock}
                          disabled={!unitLabel}
                          onChange={(event) =>
                            handleMinStockChange(
                              row.ingredientId,
                              event.target.value,
                            )
                          }
                          className="min-w-0 text-right text-sm font-semibold tabular-nums"
                        />
                        <InputGroupAddon
                          align="inline-end"
                          className="max-w-16 truncate"
                        >
                          {unitLabel ?? INVENTORY_VI.missingInventoryUnit}
                        </InputGroupAddon>
                      </InputGroup>
                    </label>

                    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
                      <span>{INVENTORY_VI.colReorderQuantity}</span>
                      <InputGroup size={controlSize}>
                        <InputGroupInput
                          type="number"
                          min={0}
                          value={row.reorderQuantity ?? ""}
                          disabled={!unitLabel}
                          placeholder={INVENTORY_VI.autoPlaceholder}
                          onChange={(event) =>
                            handleReorderQtyChange(
                              row.ingredientId,
                              event.target.value,
                            )
                          }
                          className="min-w-0 text-right text-sm font-semibold tabular-nums"
                        />
                        <InputGroupAddon
                          align="inline-end"
                          className="max-w-16 truncate"
                        >
                          {unitLabel ?? INVENTORY_VI.missingInventoryUnit}
                        </InputGroupAddon>
                      </InputGroup>
                    </label>
                  </div>
                </Frame>
              );
            })}

            {filteredRows.length === 0 && (
              <div className="p-3 text-center text-sm text-muted-foreground">
                {INVENTORY_VI.countAssignNoIngredientMatches}
              </div>
            )}
          </div>
        </div>
      </AppDialog>
    </>
  );
}
