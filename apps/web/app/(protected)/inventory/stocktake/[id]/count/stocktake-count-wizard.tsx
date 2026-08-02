"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { Progress } from "@comtammatu/ui/components/progress";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  formatNumericInputDraft,
  parseVietnameseNumericInput,
} from "@comtammatu/shared/format";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { AppDetailFooter } from "@/components/surface";
import { Item } from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  NumberPadGrid,
  appendNumpadKey,
  type NumpadKey,
} from "@/components/form/number-pad-grid";
import { messages } from "@lib/messages";
import type { StocktakeLineBlind } from "../../../stocktake-actions";
import type { DraftCounts } from "../../../_components/stocktake-draft-saver";

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
  const copy = messages.inventory.stocktake.countNative;

  const total = lines.length;

  // Per-line editing buffer so backspace/decimal work as text, seeded from any
  // count already committed to the container.
  const [values, setValues] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    for (const line of lines) {
      const entry = counts[String(line.ingredientId)];
      if (isCounted(entry)) {
        initial[line.ingredientId] = formatNumericInputDraft(
          String(entry?.qty),
        );
      }
    }
    return initial;
  });
  const [activeIndex, setActiveIndex] = useState(0);

  const activeLine = lines[activeIndex] ?? null;

  const done = useMemo(
    () =>
      lines.filter((line) => isCounted(counts[String(line.ingredientId)]))
        .length,
    [lines, counts],
  );
  const remaining = total - done;
  const progressValue = total > 0 ? Math.round((done / total) * 100) : 0;

  const upNext = useMemo(() => {
    const names: string[] = [];
    for (const [i, line] of lines.entries()) {
      if (i === activeIndex) continue;
      if (isCounted(counts[String(line.ingredientId)])) continue;
      names.push(line.ingredientName);
      if (names.length >= 3) break;
    }
    return names;
  }, [lines, activeIndex, counts]);

  const handleKey = useCallback(
    (key: NumpadKey) => {
      if (!editable || activeLine == null) return;
      const id = activeLine.ingredientId;
      const nextBuffer = appendNumpadKey(values[id] ?? "", key, true);
      setValues((current) => ({ ...current, [id]: nextBuffer }));
      if (nextBuffer.length === 0) {
        onCountChange(id, null);
        return;
      }
      const parsed = parseVietnameseNumericInput(nextBuffer, {
        maxFractionDigits: 3,
      });
      if (parsed.state === "valid") onCountChange(id, parsed.value);
    },
    [editable, activeLine, values, onCountChange],
  );

  function nextUncountedIndex(fromIndex: number): number | null {
    for (const [i, line] of lines.entries()) {
      if (i === fromIndex) continue;
      if (!isCounted(counts[String(line.ingredientId)])) return i;
    }
    return null;
  }

  const commitActiveBuffer = useCallback(() => {
    if (activeLine == null) return false;
    const raw = values[activeLine.ingredientId] ?? "";
    if (raw.length === 0) {
      onCountChange(activeLine.ingredientId, null);
      return true;
    }
    const parsed = parseVietnameseNumericInput(raw, { maxFractionDigits: 3 });
    if (parsed.state !== "valid" || parsed.value < 0) {
      toast.error(copy.countInvalidQty);
      return false;
    }
    onCountChange(activeLine.ingredientId, parsed.value);
    return true;
  }, [activeLine, values, onCountChange, copy.countInvalidQty]);

  const handleSaveNext = useCallback(() => {
    if (!commitActiveBuffer()) return;
    const nextIndex = nextUncountedIndex(activeIndex);
    if (nextIndex != null) setActiveIndex(nextIndex);
  }, [activeIndex, lines, counts, commitActiveBuffer]);

  const moveActiveIndex = useCallback(
    (nextIndex: (current: number) => number) => {
      if (!commitActiveBuffer()) return;
      setActiveIndex(nextIndex);
    },
    [commitActiveBuffer],
  );

  useEffect(() => {
    if (!editable || activeLine == null) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Ignored if focusing on input fields
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      const key = e.key;
      if (key >= "0" && key <= "9") {
        handleKey(key as NumpadKey);
      } else if (key === "." || key === ",") {
        handleKey(",");
      } else if (key === "Backspace") {
        handleKey("del");
      } else if (key === "Enter") {
        e.preventDefault();
        handleSaveNext();
          } else if (key === "ArrowUp" || key === "ArrowLeft") {
            e.preventDefault();
            moveActiveIndex((prev) => (prev > 0 ? prev - 1 : prev));
          } else if (key === "ArrowDown" || key === "ArrowRight") {
            e.preventDefault();
            moveActiveIndex((prev) => (prev < total - 1 ? prev + 1 : prev));
          }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [editable, activeLine, handleKey, handleSaveNext, moveActiveIndex, total]);

  const activeBuffer =
    activeLine != null ? (values[activeLine.ingredientId] ?? "") : "";
  const activeUnitOptions =
    activeLine == null
      ? []
      : (unitOptionsByIngredient?.[activeLine.ingredientId] ?? []);
  const activeUnitId =
    activeLine == null
      ? null
      : (unitByIngredient?.[activeLine.ingredientId] ??
        activeUnitOptions.reduce<(typeof activeUnitOptions)[number] | null>(
          (best, option) =>
            best == null || option.toBaseFactor > best.toBaseFactor
              ? option
              : best,
          null,
        )?.unitId ??
        activeUnitOptions.find((option) => option.isBase)?.unitId ??
        activeUnitOptions[0]?.unitId ??
        null);

  return (
    <div className="flex w-full flex-col gap-2">
      <Item variant="outline" size="sm" className="flex-col items-stretch gap-2 bg-muted/30">
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

      <InteractiveCard className="flex-col items-center gap-1.5 border-primary/20 text-center">
        <div className="text-sm font-medium">
          {activeLine?.ingredientName ?? "—"}
        </div>
        <div className="font-mono text-3xl font-semibold tabular-nums">
          {activeBuffer.length > 0 ? activeBuffer : "0"}
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            {activeLine != null
              ? (unitLabelByIngredient[activeLine.ingredientId] ??
                activeLine.unit)
              : null}
          </span>
        </div>
        {activeLine != null &&
        unitPreviewByIngredient[activeLine.ingredientId] ? (
          <div className="text-xs text-muted-foreground">
            {unitPreviewByIngredient[activeLine.ingredientId]}
          </div>
        ) : null}
        {activeLine != null &&
        onUnitChange &&
        activeUnitOptions.length > 1 &&
        activeUnitId !== null ? (
          <div className="w-full pt-1 text-left">
            <Select
              value={String(activeUnitId)}
              onValueChange={(value) =>
                onUnitChange(activeLine.ingredientId, Number(value))
              }
              disabled={!editable}
            >
              <SelectTrigger
                aria-label="Counting unit"
                size="touch"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {activeUnitOptions.map((option) => (
                  <SelectItem key={option.unitId} value={String(option.unitId)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {upNext.length > 0 ? (
          <div className="text-xs text-muted-foreground">
            {copy.countUpNext(upNext)}
          </div>
        ) : null}
      </InteractiveCard>

      <InteractiveCard>
        <NumberPadGrid onKey={handleKey} allowDecimal className="w-full" />
      </InteractiveCard>

      <Button
        type="button"
        size="touch-lg"
        className="w-full"
        onClick={handleSaveNext}
        disabled={!editable || activeLine == null}
      >
        {copy.countSaveNext}
      </Button>

      {showFooter ? (
        <AppDetailFooter
          sticky
          trailing={
            <Button
              type="button"
              size="touch"
              variant="outline"
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
