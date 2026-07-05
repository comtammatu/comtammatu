"use client";

import { useMemo, useState } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { InteractiveCard } from "@/components/data-table/interactive-card";
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
  /** Slot for the compact draft-saver badge and zone-lock indicator. */
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
      if (isCounted(entry)) initial[line.ingredientId] = String(entry?.qty);
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

  function handleKey(key: NumpadKey) {
    if (!editable || activeLine == null) return;
    const id = activeLine.ingredientId;
    const nextBuffer = appendNumpadKey(values[id] ?? "", key, true);
    setValues((current) => ({ ...current, [id]: nextBuffer }));
    if (nextBuffer.length === 0) {
      onCountChange(id, null);
      return;
    }
    // A trailing "." (e.g. "0.") is an incomplete decimal — don't commit it, or a
    // half-typed count would land as qty=0. Commit once the number is complete.
    if (nextBuffer.endsWith(".")) return;
    const parsed = Number(nextBuffer);
    if (Number.isFinite(parsed)) onCountChange(id, parsed);
  }

  function nextUncountedIndex(fromIndex: number): number | null {
    for (const [i, line] of lines.entries()) {
      if (i === fromIndex) continue;
      if (!isCounted(counts[String(line.ingredientId)])) return i;
    }
    return null;
  }

  function handleSaveNext() {
    if (activeLine == null) return;
    const raw = values[activeLine.ingredientId] ?? "";
    const qty = Number(raw);
    if (raw.length === 0 || raw.endsWith(".") || !Number.isFinite(qty) || qty < 0) {
      toast.error(copy.countInvalidQty);
      return;
    }
    // Commit the final value explicitly so counts matches the buffer even if the
    // last keypress was an uncommitted incomplete-decimal step.
    onCountChange(activeLine.ingredientId, qty);
    const nextIndex = nextUncountedIndex(activeIndex);
    if (nextIndex != null) setActiveIndex(nextIndex);
  }

  const activeBuffer =
    activeLine != null ? (values[activeLine.ingredientId] ?? "") : "";

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-sm font-medium">
          {copy.countMode(currentRound)}
        </span>
        <span className="text-xs font-medium text-muted-foreground tabular-nums">
          {copy.countRatio(done, total)}
        </span>
      </div>

      {chrome}

      <InteractiveCard className="flex-col items-center gap-1.5 border-primary/40 text-center">
        <div className="text-sm font-medium">
          {activeLine?.ingredientName ?? "—"}
        </div>
        <div className="font-mono text-3xl font-bold tabular-nums">
          {activeBuffer.length > 0 ? activeBuffer : "0"}
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            {activeLine != null
              ? (unitLabelByIngredient[activeLine.ingredientId] ??
                activeLine.unit)
              : null}
          </span>
        </div>
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

      {upNext.length > 0 ? (
        <div className="text-center text-xs text-muted-foreground">
          {copy.countUpNext(upNext)}
        </div>
      ) : null}

      <div className="sticky chrome-safe-bottom z-10 flex w-full flex-col gap-2">
        <Button
          type="button"
          size="touch"
          variant="outline"
          className="w-full"
          onClick={onSubmit}
          disabled={!editable || submitting || done === 0}
        >
          {submitting ? <Spinner className="size-4" /> : null}
          {remaining > 0
            ? copy.countSubmitRemaining(remaining)
            : copy.countSubmitAll}
        </Button>
      </div>
    </div>
  );
}
