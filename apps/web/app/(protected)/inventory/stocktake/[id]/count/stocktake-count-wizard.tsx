"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2 as IconCheckCircle, Circle as IconCircle } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Progress } from "@comtammatu/ui/components/progress";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Item, ItemGroup } from "@comtammatu/ui/components/item";
import { Input } from "@comtammatu/ui/components/input";
import { AppDetailFooter } from "@/components/surface";
import { messages } from "@lib/messages";
import type { StocktakeLineBlind } from "../../../stocktake-actions";
import type { DraftCounts } from "../../../_components/stocktake-draft-saver";
import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
import {
  normalizeCountUnitLadder,
  combineMultiUnitQuantities,
  decomposeBaseQuantityToUnits,
  normalizeEnteredUnitValues,
  formatMultiUnitBreakdown,
  type CountUnitItem,
} from "@lib/inventory/multiunit-count";
import { NumberPadSheet } from "@/components/form/number-pad-sheet";
import { MultiUnitNumberPadSheet } from "@/components/form/multi-unit-number-pad-sheet";

interface StocktakeCountWizardProps {
  lines: StocktakeLineBlind[];
  counts: DraftCounts;
  onCountChange: (ingredientId: number, qty: number | null) => void;
  onSubmit: () => void;
  submitting: boolean;
  editable: boolean;
  currentRound: number;
  unitLabelByIngredient: Record<number, string>;
  unitPreviewByIngredient: Record<number, string>;
  unitOptionsByIngredient?: Record<number, CountUnitItem[]>;
  unitByIngredient?: Record<number, number>;
  onUnitChange?: (ingredientId: number, unitId: number) => void;
  showFooter?: boolean;
  chrome?: React.ReactNode;
}

function isCounted(entry: DraftCounts[string] | undefined): boolean {
  return typeof entry?.qty === "number" && Number.isFinite(entry.qty);
}

export function StocktakeCountWizard({
  lines,
  counts,
  onCountChange,
  onSubmit,
  submitting,
  editable,
  currentRound,
  unitLabelByIngredient,
  unitPreviewByIngredient,
  unitOptionsByIngredient = {},
  showFooter = true,
  chrome,
}: StocktakeCountWizardProps) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);
  const copy = messages.inventory.stocktake.countNative;

  const [sheetIngredientId, setSheetIngredientId] = useState<number | null>(null);

  // Local inputs state per ingredient and unit: { [ingredientId]: { [unitId]: string } }
  const [unitInputs, setUnitInputs] = useState<
    Record<number, Record<number, string>>
  >({});

  // Sync unitInputs from counts prop when counts change from drafts or initial load
  useEffect(() => {
    setUnitInputs((prev) => {
      const next = { ...prev };
      for (const line of lines) {
        const id = line.ingredientId;
        const entry = counts[String(id)];
        if (isCounted(entry)) {
          const ladder = normalizeCountUnitLadder(unitOptionsByIngredient[id]);
          const decomposed = decomposeBaseQuantityToUnits(entry!.qty, ladder);
          const currentLineInputs = next[id] ?? {};
          const nextLineInputs: Record<number, string> = { ...currentLineInputs };
          for (const unit of ladder) {
            const val = decomposed[unit.unitId] ?? 0;
            // Only update if not currently being actively typed
            if (currentLineInputs[unit.unitId] === undefined) {
              nextLineInputs[unit.unitId] = val > 0 ? String(val) : "";
            }
          }
          next[id] = nextLineInputs;
        }
      }
      return next;
    });
  }, [counts, lines, unitOptionsByIngredient]);

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
  const sheetLadder = sheetLine
    ? normalizeCountUnitLadder(unitOptionsByIngredient[sheetLine.ingredientId])
    : [];
  const sheetEntry =
    sheetLine != null ? counts[String(sheetLine.ingredientId)] : undefined;
  const sheetUnitLabel =
    sheetLine != null
      ? (unitLabelByIngredient[sheetLine.ingredientId] ?? sheetLine.unit)
      : undefined;

  function handleSheetConfirm(value: number) {
    if (sheetLine == null || !editable) return;
    onCountChange(sheetLine.ingredientId, value);
    setSheetIngredientId(null);
  }

  function handleMultiUnitSheetConfirm(unitValues: Record<number, number>) {
    if (sheetLine == null || !editable) return;
    const ladder = normalizeCountUnitLadder(
      unitOptionsByIngredient[sheetLine.ingredientId],
    );
    const { totalBaseQty, normalizedValues } = normalizeEnteredUnitValues(
      unitValues,
      ladder,
    );

    setUnitInputs((prev) => ({
      ...prev,
      [sheetLine.ingredientId]: Object.fromEntries(
        Object.entries(normalizedValues).map(([k, v]) => [
          k,
          v > 0 ? String(v) : "",
        ]),
      ),
    }));

    onCountChange(
      sheetLine.ingredientId,
      totalBaseQty > 0 ? totalBaseQty : null,
    );
    setSheetIngredientId(null);
  }

  function handleUnitInputChange(
    ingredientId: number,
    unitId: number,
    rawVal: string,
    ladder: CountUnitItem[],
  ) {
    if (!editable) return;
    const nextForLine = {
      ...(unitInputs[ingredientId] ?? {}),
      [unitId]: rawVal,
    };

    setUnitInputs((prev) => ({
      ...prev,
      [ingredientId]: nextForLine,
    }));

    const totalBase = combineMultiUnitQuantities(nextForLine, ladder);
    const hasAnyInput = Object.values(nextForLine).some(
      (v) => v !== undefined && v !== null && v.trim() !== "",
    );

    if (!hasAnyInput) {
      onCountChange(ingredientId, null);
    } else {
      onCountChange(ingredientId, totalBase);
    }
  }

  function handleUnitInputBlur(
    ingredientId: number,
    ladder: CountUnitItem[],
  ) {
    if (!editable) return;
    const currentLineInputs = unitInputs[ingredientId] ?? {};
    const hasAnyInput = Object.values(currentLineInputs).some(
      (v) => v !== undefined && v !== null && v.trim() !== "",
    );

    if (!hasAnyInput) {
      onCountChange(ingredientId, null);
      return;
    }

    const { totalBaseQty, normalizedValues } = normalizeEnteredUnitValues(
      currentLineInputs,
      ladder,
    );

    setUnitInputs((prev) => ({
      ...prev,
      [ingredientId]: Object.fromEntries(
        Object.entries(normalizedValues).map(([k, v]) => [
          k,
          v > 0 ? String(v) : "",
        ]),
      ),
    }));

    onCountChange(ingredientId, totalBaseQty > 0 ? totalBaseQty : 0);
  }

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
    targetId: string,
  ) {
    if (event.key === "Enter") {
      event.preventDefault();
      const nextInput = document.getElementById(targetId) as HTMLInputElement | null;
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
      }
    }
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <Item
        variant="outline"
        size="sm"
        className="flex-col items-stretch gap-2 bg-card p-3 shadow-xs"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">
              {copy.countMode(currentRound)}
            </span>
            <Badge variant="outline" className="font-mono text-xs">
              {copy.countDoneBadge(done, total)}
            </Badge>
          </div>
          <span className="text-xs font-semibold text-muted-foreground tabular-nums">
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
        {lines.map((line, lineIdx) => {
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

          const lineInputs = unitInputs[line.ingredientId] ?? {};
          const multiUnitPreview =
            counted && qty != null
              ? formatMultiUnitBreakdown(qty, ladder, { showBaseSecondary: true })
              : null;

          return (
            <Item
              key={line.ingredientId}
              variant="outline"
              size="sm"
              className="flex-col gap-3 p-3 transition-colors sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {counted ? (
                  <IconCheckCircle className="size-5 shrink-0 text-success" />
                ) : (
                  <IconCircle className="size-5 shrink-0 text-muted-foreground/50" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">
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
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!isTouchLayout ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {ladder.map((unit, unitIdx) => {
                      const inputId = `count-input-${lineIdx}-${unitIdx}`;
                      const nextInputId =
                        unitIdx + 1 < ladder.length
                          ? `count-input-${lineIdx}-${unitIdx + 1}`
                          : lineIdx + 1 < lines.length
                            ? `count-input-${lineIdx + 1}-0`
                            : `count-input-${lineIdx}-${unitIdx}`;

                      const unitVal =
                        lineInputs[unit.unitId] ??
                        (counted && qty != null
                          ? (decomposeBaseQuantityToUnits(qty, ladder)[unit.unitId]
                              ? String(
                                  decomposeBaseQuantityToUnits(qty, ladder)[
                                    unit.unitId
                                  ],
                                )
                              : "")
                          : "");

                      return (
                        <div
                          key={unit.unitId}
                          className="flex items-center gap-1"
                        >
                          {unitIdx > 0 ? (
                            <span className="px-0.5 text-xs font-semibold text-muted-foreground">
                              +
                            </span>
                          ) : null}
                          <Input
                            id={inputId}
                            type="text"
                            inputMode="decimal"
                            disabled={!editable}
                            placeholder="0"
                            aria-label={unit.label || unit.code}
                            value={unitVal}
                            onChange={(e) =>
                              handleUnitInputChange(
                                line.ingredientId,
                                unit.unitId,
                                e.target.value,
                                ladder,
                              )
                            }
                            onBlur={() =>
                              handleUnitInputBlur(line.ingredientId, ladder)
                            }
                            onKeyDown={(e) => handleKeyDown(e, nextInputId)}
                            className="h-8 w-16 text-right font-mono text-sm font-semibold tabular-nums"
                          />
                          <span className="shrink-0 text-xs font-medium text-muted-foreground">
                            {unit.label || unit.code}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant={counted ? "outline" : "secondary"}
                    size={isTouchLayout ? "touch" : "default"}
                    disabled={!editable}
                    onClick={() => setSheetIngredientId(line.ingredientId)}
                    className="shrink-0 font-mono text-sm font-semibold tabular-nums"
                  >
                    {counted && qty != null
                      ? multiUnitPreview || `${qty} ${unitLabelByIngredient[line.ingredientId] ?? line.unit}`
                      : copy.countTapToEnter}
                  </Button>
                )}
              </div>
            </Item>
          );
        })}
      </ItemGroup>

      {sheetLine ? (
        sheetLadder.length > 1 ? (
          <MultiUnitNumberPadSheet
            open={sheetLine != null}
            onOpenChange={(next) => {
              if (!next) setSheetIngredientId(null);
            }}
            title={sheetLine.ingredientName}
            units={sheetLadder}
            initialBaseQty={sheetEntry?.qty ?? null}
            onConfirm={handleMultiUnitSheetConfirm}
          />
        ) : (
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
        )
      ) : null}

      {showFooter ? (
        <AppDetailFooter
          sticky
          trailing={
            <Button
              type="button"
              size={isTouchLayout ? "touch-lg" : "lg"}
              onClick={onSubmit}
              disabled={!editable || submitting || done === 0}
            >
              {submitting ? <Spinner className="size-4" /> : null}
              {remaining > 0
                ? copy.countSubmitRemaining(remaining)
                : copy.countSubmitAll}
            </Button>
          }
        />
      ) : null}
    </div>
  );
}
