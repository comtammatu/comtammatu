"use client";

import { useMemo, useState } from "react";
import { CheckCircle2 as IconCheckCircle, Circle as IconCircle } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Progress } from "@comtammatu/ui/components/progress";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Input } from "@comtammatu/ui/components/input";
import { Item, ItemGroup } from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { AppDetailFooter } from "@/components/surface";
import { NumberPadSheet } from "@/components/form/number-pad-sheet";
import { messages } from "@lib/messages";
import { FORM_VI } from "@comtammatu/shared/messages";
import type { StocktakeLineBlind } from "../../../stocktake-actions";
import type { DraftCounts } from "../../../_components/stocktake-draft-saver";

import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
import {
  resolveCountPackLooseUnits,
  combineCountPackLooseQuantity,
  splitCountToPackLoose,
  formatCountPackLooseQuantity,
} from "../../../_lib/count-units";

interface StocktakeCountWizardProps {
  /** Current-round lines already filtered by the container. */
  lines: StocktakeLineBlind[];
  counts: DraftCounts;
  onCountChange: (ingredientId: number, qty: number | null) => void;
  onSubmit: () => void;
  submitting: boolean;
  editable: boolean;
  currentRound: number;
  /** Label of the unit each count is recorded in — shown so display == submit. */
  unitLabelByIngredient: Record<number, string>;
  unitPreviewByIngredient: Record<number, string>;
  unitOptionsByIngredient?: Record<number, StocktakeCountUnit[]>;
  unitByIngredient?: Record<number, number>;
  onUnitChange?: (ingredientId: number, unitId: number) => void;
  showFooter?: boolean;
  /** Slot for the compact draft-saver badge and zone-lock indicator. */
  chrome?: React.ReactNode;
}

interface StocktakeCountUnit {
  unitId: number;
  code: string;
  label: string;
  isBase: boolean;
  toBaseFactor: number;
}

function isCounted(entry: DraftCounts[string] | undefined): boolean {
  return typeof entry?.qty === "number" && Number.isFinite(entry.qty);
}

function resolveUnitId(
  ingredientId: number,
  unitOptions: StocktakeCountUnit[],
  unitByIngredient?: Record<number, number>,
): number | null {
  return (
    unitByIngredient?.[ingredientId] ??
    unitOptions.reduce<StocktakeCountUnit | null>(
      (best, option) =>
        best == null || option.toBaseFactor > best.toBaseFactor ? option : best,
      null,
    )?.unitId ??
    unitOptions.find((option) => option.isBase)?.unitId ??
    unitOptions[0]?.unitId ??
    null
  );
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
  unitOptionsByIngredient,
  unitByIngredient,
  onUnitChange,
  showFooter = true,
  chrome,
}: StocktakeCountWizardProps) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);

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

  function handleDesktopInputChange(ingredientId: number, rawVal: string) {
    if (!editable) return;
    const trimmed = rawVal.trim();
    if (trimmed === "") {
      onCountChange(ingredientId, null);
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed >= 0) {
      onCountChange(ingredientId, parsed);
    }
  }

  function handleDualPackChange(
    ingredientId: number,
    rawPack: string,
    currentLoose: number,
    packFactor: number,
    toBaseFactor: number,
    selectedToBase: number,
  ) {
    if (!editable) return;
    const parsedPack = Number(rawPack.trim());
    const validPack = Number.isFinite(parsedPack) && parsedPack >= 0 ? parsedPack : 0;
    const totalLoose = combineCountPackLooseQuantity(validPack, currentLoose, packFactor);
    const finalQty = Math.round(((totalLoose * toBaseFactor) / selectedToBase) * 1000) / 1000;
    onCountChange(ingredientId, finalQty);
  }

  function handleDualLooseChange(
    ingredientId: number,
    currentPack: number,
    rawLoose: string,
    packFactor: number,
    toBaseFactor: number,
    selectedToBase: number,
  ) {
    if (!editable) return;
    const parsedLoose = Number(rawLoose.trim());
    const validLoose = Number.isFinite(parsedLoose) && parsedLoose >= 0 ? parsedLoose : 0;
    const totalLoose = combineCountPackLooseQuantity(currentPack, validLoose, packFactor);
    const finalQty = Math.round(((totalLoose * toBaseFactor) / selectedToBase) * 1000) / 1000;
    onCountChange(ingredientId, finalQty);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>, targetId: string) {
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
        {lines.map((line, index) => {
          const counted = isCounted(counts[String(line.ingredientId)]);
          const qty = counts[String(line.ingredientId)]?.qty;
          const unitOptions =
            unitOptionsByIngredient?.[line.ingredientId] ?? [];
          const packLoose = resolveCountPackLooseUnits(unitOptions);
          const unitId = resolveUnitId(
            line.ingredientId,
            unitOptions,
            unitByIngredient,
          );
          const selectedUnit =
            unitOptions.find((opt) => opt.unitId === unitId) ?? unitOptions[0];
          const unitLabel =
            unitLabelByIngredient[line.ingredientId] ?? line.unit;

          const selectedToBase = selectedUnit?.toBaseFactor ?? 1;
          const looseToBase = packLoose?.looseUnit.toBaseFactor ?? 1;
          const totalLoose =
            qty != null && packLoose
              ? Math.round(((qty * selectedToBase) / looseToBase) * 1000) / 1000
              : 0;
          const { packQty, looseQty } = packLoose
            ? splitCountToPackLoose(totalLoose, packLoose.packFactor)
            : { packQty: 0, looseQty: 0 };

          const dualPreview =
            counted && packLoose && qty != null && qty > 0
              ? `${formatCountPackLooseQuantity(
                  packQty,
                  packLoose.packUnit.label,
                  looseQty,
                  packLoose.looseUnit.label,
                )} (${qty} ${unitLabel})`
              : null;

          return (
            <Item
              key={line.ingredientId}
              variant="outline"
              size="sm"
              className="flex-col gap-2 p-3 transition-colors sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {counted ? (
                  <IconCheckCircle className="size-5 shrink-0 text-success" />
                ) : (
                  <IconCircle className="size-5 shrink-0 text-muted-foreground/50" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {line.ingredientName}
                  </div>
                  {dualPreview ? (
                    <div className="truncate font-mono text-xs font-semibold text-primary">
                      {dualPreview}
                    </div>
                  ) : unitPreviewByIngredient[line.ingredientId] ? (
                    <div className="truncate text-xs text-muted-foreground">
                      {unitPreviewByIngredient[line.ingredientId]}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {onUnitChange && unitOptions.length > 1 && unitId != null ? (
                  <Select
                    value={String(unitId)}
                    onValueChange={(value) =>
                      onUnitChange(line.ingredientId, Number(value))
                    }
                    disabled={!editable}
                  >
                    <SelectTrigger
                      aria-label={FORM_VI.unit}
                      size={isTouchLayout ? "touch" : "default"}
                      className="w-32 shrink-0"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {unitOptions.map((option) => (
                        <SelectItem
                          key={option.unitId}
                          value={String(option.unitId)}
                          size={isTouchLayout ? "touch" : "default"}
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="shrink-0 px-1 text-xs font-medium text-muted-foreground">
                    {unitLabel}
                  </span>
                )}

                {!isTouchLayout ? (
                  packLoose ? (
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center gap-1">
                        <Input
                          id={`count-pack-${index}`}
                          type="text"
                          inputMode="numeric"
                          disabled={!editable}
                          placeholder="0"
                          value={counted && packQty > 0 ? String(packQty) : ""}
                          onChange={(e) =>
                            handleDualPackChange(
                              line.ingredientId,
                              e.target.value,
                              looseQty,
                              packLoose.packFactor,
                              looseToBase,
                              selectedToBase,
                            )
                          }
                          onKeyDown={(e) =>
                            handleKeyDown(e, `count-loose-${index}`)
                          }
                          className="h-8 w-16 font-mono text-sm text-right tabular-nums"
                        />
                        <span className="text-xs text-muted-foreground">
                          {packLoose.packUnit.label}
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-muted-foreground">
                        +
                      </span>
                      <div className="flex items-center gap-1">
                        <Input
                          id={`count-loose-${index}`}
                          type="text"
                          inputMode="decimal"
                          disabled={!editable}
                          placeholder="0"
                          value={counted && looseQty > 0 ? String(looseQty) : ""}
                          onChange={(e) =>
                            handleDualLooseChange(
                              line.ingredientId,
                              packQty,
                              e.target.value,
                              packLoose.packFactor,
                              looseToBase,
                              selectedToBase,
                            )
                          }
                          onKeyDown={(e) =>
                            handleKeyDown(
                              e,
                              index + 1 < lines.length
                                ? `count-pack-${index + 1}`
                                : `count-input-${index + 1}`,
                            )
                          }
                          className="h-8 w-16 font-mono text-sm text-right tabular-nums"
                        />
                        <span className="text-xs text-muted-foreground">
                          {packLoose.looseUnit.label}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input
                        id={`count-input-${index}`}
                        type="text"
                        inputMode="decimal"
                        disabled={!editable}
                        placeholder={copy.inputPlaceholder}
                        value={qty != null ? String(qty) : ""}
                        onChange={(e) =>
                          handleDesktopInputChange(
                            line.ingredientId,
                            e.target.value,
                          )
                        }
                        onKeyDown={(e) =>
                          handleKeyDown(e, `count-input-${index + 1}`)
                        }
                        className="h-8 w-28 font-mono text-sm text-right tabular-nums"
                      />
                    </div>
                  )
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
                      ? dualPreview || `${qty} ${unitLabel}`
                      : copy.countTapToEnter}
                  </Button>
                )}
              </div>
            </Item>
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
