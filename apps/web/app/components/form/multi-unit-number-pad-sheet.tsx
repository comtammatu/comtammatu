"use client";

import * as React from "react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import {
  formatNumericInputDraft,
  parseVietnameseNumericInput,
} from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import { AppDrawer } from "@/components/surface/app-drawer";
import {
  NumberPadGrid,
  appendNumpadKey,
  type NumpadKey,
} from "./number-pad-grid";
import {
  decomposeBaseQuantityToUnits,
  normalizeEnteredUnitValues,
  type CountUnitItem,
} from "@lib/inventory/multiunit-count";

type MultiUnitNumberPadSheetProps = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  units: CountUnitItem[];
  initialBaseQty?: number | null;
  onConfirm: (unitValues: Record<number, number>) => void;
  confirmLabel?: string;
  allowDecimal?: boolean;
};

export function MultiUnitNumberPadSheet({
  open,
  onOpenChange,
  title,
  units,
  initialBaseQty,
  onConfirm,
  confirmLabel = ACTIONS_VI.confirm,
  allowDecimal = true,
}: MultiUnitNumberPadSheetProps) {
  // Sort ladder descending
  const ladder = React.useMemo(() => {
    return [...units].sort((a, b) => b.toBaseFactor - a.toBaseFactor);
  }, [units]);

  const [activeUnitId, setActiveUnitId] = React.useState<number>(() => {
    return ladder[0]?.unitId ?? 0;
  });

  const [unitBuffers, setUnitBuffers] = React.useState<Record<number, string>>({});

  // Initialize buffers when opened
  React.useEffect(() => {
    if (open) {
      const defaultActive = ladder[0]?.unitId ?? 0;
      setActiveUnitId(defaultActive);

      if (initialBaseQty != null && Number.isFinite(initialBaseQty) && initialBaseQty > 0) {
        const decomposed = decomposeBaseQuantityToUnits(initialBaseQty, ladder);
        const buffers: Record<number, string> = {};
        for (const u of ladder) {
          const val = decomposed[u.unitId] ?? 0;
          buffers[u.unitId] = val > 0 ? formatNumericInputDraft(String(val)) : "";
        }
        setUnitBuffers(buffers);
      } else {
        setUnitBuffers({});
      }
    }
  }, [open, initialBaseQty, ladder]);

  // Current active unit buffer
  const currentBuffer = unitBuffers[activeUnitId] ?? "";
  const activeUnit = ladder.find((u) => u.unitId === activeUnitId) ?? ladder[0];

  // Calculate parsed unit values for live preview
  const parsedUnitValues = React.useMemo(() => {
    const values: Record<number, number> = {};
    for (const u of ladder) {
      const buf = unitBuffers[u.unitId];
      if (buf) {
        const res = parseVietnameseNumericInput(buf, { maxFractionDigits: 3 });
        if (res.state === "valid" && res.value >= 0) {
          values[u.unitId] = res.value;
        }
      }
    }
    return values;
  }, [unitBuffers, ladder]);

  const preview = React.useMemo(() => {
    return normalizeEnteredUnitValues(parsedUnitValues, ladder);
  }, [parsedUnitValues, ladder]);

  function handleTap(key: NumpadKey) {
    setUnitBuffers((current) => {
      const currentVal = current[activeUnitId] ?? "";
      const nextVal = appendNumpadKey(currentVal, key, allowDecimal);
      return {
        ...current,
        [activeUnitId]: nextVal,
      };
    });
  }

  function handleClearAll() {
    setUnitBuffers({});
  }

  function handleConfirm() {
    onConfirm(parsedUnitValues);
    onOpenChange(false);
  }

  return (
    <AppDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-base font-semibold">{title}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            className="h-7 text-xs text-muted-foreground"
          >
            {ACTIONS_VI.reset}
          </Button>
        </div>
      }
      footer={
        <Button
          type="button"
          size="default"
          className="w-full text-base font-semibold"
          onClick={handleConfirm}
        >
          {confirmLabel}
          {preview.totalBaseQty > 0 ? ` (${preview.formattedBreakdown})` : ""}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {/* Multi-unit selector */}
        {ladder.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {ladder.map((u) => {
              const isSelected = u.unitId === activeUnitId;
              const buf = unitBuffers[u.unitId];
              return (
                <Button
                  key={u.unitId}
                  type="button"
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveUnitId(u.unitId)}
                  className="gap-1 text-xs font-medium"
                >
                  <span>{u.label || u.code}</span>
                  {buf ? (
                    <span className="font-mono tabular-nums">
                      : {buf}
                    </span>
                  ) : null}
                </Button>
              );
            })}
          </div>
        ) : null}

        {/* Active Unit Input display & Live Result */}
        <div className="flex items-baseline justify-between gap-3 border-y border-border py-2">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-3xl font-semibold tabular-nums text-foreground">
              {currentBuffer.length === 0 ? "0" : currentBuffer}
            </span>
            <span className="text-base font-medium text-muted-foreground">
              {activeUnit?.label || activeUnit?.code}
            </span>
          </div>

          {preview.totalBaseQty > 0 ? (
            <div className="text-right">
              <div className="font-mono text-xs font-semibold text-primary">
                ➔ {preview.formattedBreakdown}
              </div>
            </div>
          ) : null}
        </div>

        <NumberPadGrid
          onKey={handleTap}
          allowDecimal={allowDecimal}
          className="pt-1"
        />
      </div>
    </AppDrawer>
  );
}
