"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  CheckCircle2 as IconCheckCircle,
  Circle as IconCircle,
} from "lucide-react";
import { Progress } from "@comtammatu/ui/components/progress";
import { Item, ItemGroup } from "@comtammatu/ui/components/item";
import { cn } from "@comtammatu/ui";
import { MultiUnitNumberPadSheet } from "@/components/form/multi-unit-number-pad-sheet";
import { messages } from "@lib/messages";
import type {
  BranchStocktakeCountLine,
  BranchStocktakeCountUnit,
  DraftCounts,
} from "@lib/inventory/stocktake-model";
import {
  normalizeCountUnitLadder,
  normalizeEnteredUnitValues,
  formatMultiUnitBreakdown,
} from "@lib/inventory/multiunit-count";

interface BranchStocktakeCountListProps {
  lines: BranchStocktakeCountLine[];
  counts: DraftCounts;
  onCountChange: (ingredientId: number, qty: number | null) => void;
  editable: boolean;
  currentRound: number;
  unitLabelByIngredient: Record<number, string>;
  unitPreviewByIngredient: Record<number, string>;
  unitOptionsByIngredient?: Record<number, BranchStocktakeCountUnit[]>;
  unitByIngredient?: Record<number, number>;
  onUnitChange?: (ingredientId: number, unitId: number) => void;
  chrome?: ReactNode;
}

function isCounted(entry: DraftCounts[string] | undefined): boolean {
  return typeof entry?.qty === "number" && Number.isFinite(entry.qty);
}

export function BranchStocktakeCountList({
  lines,
  counts,
  onCountChange,
  editable,
  currentRound,
  unitLabelByIngredient,
  unitPreviewByIngredient,
  unitOptionsByIngredient = {},
  chrome,
}: BranchStocktakeCountListProps) {
  const copy = messages.inventory.stocktake.countNative;
  const [sheetIngredientId, setSheetIngredientId] = useState<number | null>(
    null,
  );

  const total = lines.length;
  const done = useMemo(
    () =>
      lines.filter((line) => isCounted(counts[String(line.ingredientId)]))
        .length,
    [lines, counts],
  );
  const remaining = total - done;
  const progressValue = total > 0 ? Math.round((done / total) * 100) : 0;

  const sheetLine =
    sheetIngredientId == null
      ? null
      : (lines.find((line) => line.ingredientId === sheetIngredientId) ?? null);
  const sheetEntry =
    sheetLine != null ? counts[String(sheetLine.ingredientId)] : undefined;
  const sheetLadder = sheetLine
    ? normalizeCountUnitLadder(
        unitOptionsByIngredient[sheetLine.ingredientId] ?? [
          {
            unitId: 0,
            code: sheetLine.unit,
            label: sheetLine.unit,
            isBase: true,
            toBaseFactor: 1,
          },
        ],
      )
    : [];

  function handleSheetConfirm(unitValues: Record<number, number>) {
    if (sheetLine == null || !editable) return;
    const ladder = normalizeCountUnitLadder(
      unitOptionsByIngredient[sheetLine.ingredientId] ?? [
        {
          unitId: 0,
          code: sheetLine.unit,
          label: sheetLine.unit,
          isBase: true,
          toBaseFactor: 1,
        },
      ],
    );
    const { totalBaseQty } = normalizeEnteredUnitValues(unitValues, ladder);
    onCountChange(sheetLine.ingredientId, totalBaseQty > 0 ? totalBaseQty : null);
    setSheetIngredientId(null);
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <Item
        variant="outline"
        size="sm"
        className="flex-col items-stretch gap-2 bg-muted/30"
      >
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm font-medium">
            {copy.countMode(currentRound)}
          </span>
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {copy.countRatio(done, total)}
          </span>
        </div>
        <Progress
          value={progressValue}
          tone={remaining === 0 && total > 0 ? "success" : "default"}
          className="h-2"
        />
      </Item>

      {chrome}

      <ItemGroup className="gap-2">
        {lines.map((line) => {
          const counted = isCounted(counts[String(line.ingredientId)]);
          const qty = counts[String(line.ingredientId)]?.qty;
          const rawOptions = unitOptionsByIngredient[line.ingredientId] ?? [];
          const ladder = normalizeCountUnitLadder(
            rawOptions.length > 0
              ? rawOptions
              : [
                  {
                    unitId: 0,
                    code: line.unit,
                    label: line.unit,
                    isBase: true,
                    toBaseFactor: 1,
                  },
                ],
          );

          const multiUnitPreview =
            counted && qty != null
              ? formatMultiUnitBreakdown(qty, ladder, { showBaseSecondary: true })
              : null;

          return (
            <div key={line.ingredientId} className="flex flex-col gap-2">
              <Item
                variant="outline"
                render={
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => setSheetIngredientId(line.ingredientId)}
                    className="flex w-full items-center gap-3 text-left touch-manipulation"
                  />
                }
              >
                {counted ? (
                  <IconCheckCircle className="size-5 shrink-0 text-primary" />
                ) : (
                  <IconCircle className="size-5 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {line.ingredientName}
                  </div>
                  {multiUnitPreview ? (
                    <div className="truncate font-mono text-xs font-semibold text-primary">
                      {multiUnitPreview}
                    </div>
                  ) : unitPreviewByIngredient[line.ingredientId] ? (
                    <div className="truncate text-xs text-muted-foreground">
                      {unitPreviewByIngredient[line.ingredientId]}
                    </div>
                  ) : (
                    <div className="truncate text-xs text-muted-foreground">
                      {ladder.map((u) => u.label || u.code).join(" · ")}
                    </div>
                  )}
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-md px-3 py-1 font-mono text-sm font-semibold tabular-nums",
                    counted
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground",
                  )}
                >
                  {counted && qty != null
                    ? multiUnitPreview || `${qty} ${unitLabelByIngredient[line.ingredientId] ?? line.unit}`
                    : copy.countTapToEnter}
                </span>
              </Item>
            </div>
          );
        })}
      </ItemGroup>

      {sheetLine ? (
        <MultiUnitNumberPadSheet
          open={sheetLine != null}
          onOpenChange={(next) => {
            if (!next) setSheetIngredientId(null);
          }}
          title={sheetLine.ingredientName}
          units={sheetLadder}
          initialBaseQty={sheetEntry?.qty ?? null}
          onConfirm={handleSheetConfirm}
        />
      ) : null}
    </div>
  );
}
