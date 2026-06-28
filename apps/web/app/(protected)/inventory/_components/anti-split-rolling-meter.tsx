"use client";

import { useEffect, useState } from "react";
import { cn } from "@comtammatu/ui";
import { formatVND } from "@comtammatu/shared/format";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import {
  getIngredientRollingWaste,
  type IngredientRollingStatus,
} from "../waste-actions";

interface AntiSplitRollingMeterProps {
  branchId: number;
  /** When this changes, refetch rolling sum. */
  ingredientId: number | null;
  /** Live qty × unit_cost preview from parent form. */
  pendingDelta?: number;
  ingredientName?: string;
  className?: string;
}

/**
 * Anti-split rolling 15-min meter (S11 §Q1 anti-split v2, BA critical gap).
 *
 * When a user enters a waste line with SKU X, this component fetches
 * their prior rolling 15-min sum of SKU X's waste at this branch and
 * shows live projection: "Rolling 15min: 127k + 24k pending = 151k → sẽ
 * trigger photo required (tier 1, ≥150k)".
 *
 * Server still enforces — this is just user education + deterrent.
 */
export function AntiSplitRollingMeter({
  branchId,
  ingredientId,
  pendingDelta,
  ingredientName,
  className,
}: AntiSplitRollingMeterProps) {
  const [status, setStatus] = useState<IngredientRollingStatus | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (ingredientId === null) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getIngredientRollingWaste(branchId, ingredientId).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.success && res.data) setStatus(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [branchId, ingredientId]);

  if (ingredientId === null) return null;
  if (loading && !status) {
    return (
      <p
        className={cn("text-xs text-muted-foreground italic", className)}
        data-slot="anti-split-meter"
      >
        {INVENTORY_VI.loadingHistory15m}
      </p>
    );
  }
  if (!status) return null;

  const projected =
    typeof pendingDelta === "number" && Number.isFinite(pendingDelta)
      ? status.rollingSum + pendingDelta
      : status.rollingSum;

  const willTriggerPhoto = projected >= status.tierOneThreshold;

  // If no prior history and no pending, don't clutter UI.
  if (projected === 0) return null;

  const tone = willTriggerPhoto
    ? "text-tier-note-foreground bg-tier-note/10 border-tier-note/30"
    : "text-muted-foreground bg-muted/30 border-muted";

  return (
    <div
      className={cn("rounded-md border px-2 py-1 text-xs", tone, className)}
      data-slot="anti-split-meter"
      data-will-trigger={willTriggerPhoto}
    >
      <span className="font-medium">Rolling 15min</span>
      {ingredientName ? ` (${ingredientName})` : ""}:{" "}
      {formatVND(status.rollingSum)}
      {typeof pendingDelta === "number" && pendingDelta > 0 ? (
        <>
          {" + "}
          <span className="font-medium">{formatVND(pendingDelta)} pending</span>
          {" = "}
          <span className="font-semibold">{formatVND(projected)}</span>
        </>
      ) : null}
      {willTriggerPhoto ? (
        <span className="ml-1">
          → trigger tier 1 (ảnh bắt buộc, ≥{formatVND(status.tierOneThreshold)})
        </span>
      ) : null}
      {status.lineCount > 1 ? (
        <span className="ml-1">• {status.lineCount} phiếu</span>
      ) : null}
    </div>
  );
}
