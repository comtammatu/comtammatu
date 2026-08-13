"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  CheckCircle2 as IconCheckCircle,
  Circle as IconCircle,
} from "lucide-react";
import { Progress } from "@comtammatu/ui/components/progress";
import { Item, ItemGroup } from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { cn } from "@comtammatu/ui";
import { NumberPadSheet } from "@/components/form/number-pad-sheet";
import { messages } from "@lib/messages";
import type {
  BranchStocktakeCountLine,
  BranchStocktakeCountUnit,
  DraftCounts,
} from "@lib/inventory/stocktake-model";

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

function resolveUnitId(
  ingredientId: number,
  unitOptions: BranchStocktakeCountUnit[],
  unitByIngredient?: Record<number, number>,
): number | null {
  return (
    unitByIngredient?.[ingredientId] ??
    unitOptions.reduce<BranchStocktakeCountUnit | null>(
      (best, option) =>
        best == null || option.toBaseFactor > best.toBaseFactor ? option : best,
      null,
    )?.unitId ??
    unitOptions.find((option) => option.isBase)?.unitId ??
    unitOptions[0]?.unitId ??
    null
  );
}

export function BranchStocktakeCountList({
  lines,
  counts,
  onCountChange,
  editable,
  currentRound,
  unitLabelByIngredient,
  unitPreviewByIngredient,
  unitOptionsByIngredient,
  unitByIngredient,
  onUnitChange,
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
  const sheetUnitLabel =
    sheetLine != null
      ? (unitLabelByIngredient[sheetLine.ingredientId] ?? sheetLine.unit)
      : undefined;

  function handleSheetConfirm(value: number) {
    if (sheetLine == null || !editable) return;
    onCountChange(sheetLine.ingredientId, value);
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
          const unitOptions =
            unitOptionsByIngredient?.[line.ingredientId] ?? [];
          const unitId = resolveUnitId(
            line.ingredientId,
            unitOptions,
            unitByIngredient,
          );
          const unitLabel =
            unitLabelByIngredient[line.ingredientId] ?? line.unit;
          return (
            <div key={line.ingredientId} className="flex flex-col gap-2">
              <Item
                variant="outline"
                render={
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => setSheetIngredientId(line.ingredientId)}
                    className="flex w-full items-center gap-3 text-left"
                  />
                }
              >
                {counted ? (
                  <IconCheckCircle className="size-5 shrink-0 text-primary" />
                ) : (
                  <IconCircle className="size-5 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {line.ingredientName}
                  </div>
                  {unitPreviewByIngredient[line.ingredientId] ? (
                    <div className="truncate text-xs text-muted-foreground">
                      {unitPreviewByIngredient[line.ingredientId]}
                    </div>
                  ) : null}
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
                    ? `${qty} ${unitLabel}`
                    : copy.countTapToEnter}
                </span>
              </Item>
              {onUnitChange && unitOptions.length > 1 && unitId != null ? (
                <Select
                  value={String(unitId)}
                  onValueChange={(value) =>
                    onUnitChange(line.ingredientId, Number(value))
                  }
                  disabled={!editable}
                >
                  <SelectTrigger
                    aria-label={copy.countUnitAria}
                    size="touch"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {unitOptions.map((option) => (
                      <SelectItem
                        key={option.unitId}
                        value={String(option.unitId)}
                        size="touch"
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          );
        })}
      </ItemGroup>

      <NumberPadSheet
        open={sheetLine != null}
        onOpenChange={(next) => {
          if (!next) setSheetIngredientId(null);
        }}
        title={
          sheetLine
            ? `${sheetLine.ingredientName}${sheetUnitLabel ? ` · ${sheetUnitLabel}` : ""}`
            : ""
        }
        suffix={sheetUnitLabel}
        initialValue={
          sheetLine != null && isCounted(sheetEntry) ? sheetEntry?.qty : null
        }
        onConfirm={handleSheetConfirm}
        allowDecimal
      />
    </div>
  );
}
