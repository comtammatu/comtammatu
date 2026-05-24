"use client";

import { cn } from "@comtammatu/ui";
import { Progress, type ProgressTone } from "@comtammatu/ui/components/progress";
import { formatVND } from "@comtammatu/shared/format";

interface ShiftCapMeterProps {
  /** Running total value of user's waste in current shift (VND). */
  shiftSum: number;
  /** Shift cap (default 1.5M from spec Q1). */
  shiftCap?: number;
  /** Preview: what happens if user adds `pendingDelta` to this shift. */
  pendingDelta?: number;
  /** Friendly shift label, e.g. "2026-04-24 morning". */
  shiftLabel?: string;
  className?: string;
}

/**
 * Rolling shift cap meter (S11 anti-split v2).
 *
 * Visualises user_shift_cap usage:
 *   - <70%: green "OK"
 *   - 70-89%: yellow "Cảnh báo — gần cap"
 *   - ≥90%: red "Sắp chạm cap — waste kế sẽ cần duyệt"
 *
 * Pending delta (live as user types qty × unit_cost) projects the bar:
 * if `shiftSum + pendingDelta >= shiftCap`, banner shows "Sẽ trigger tier 2".
 */
export function ShiftCapMeter({
  shiftSum,
  shiftCap = 1_500_000,
  pendingDelta,
  shiftLabel,
  className,
}: ShiftCapMeterProps) {
  const projected =
    typeof pendingDelta === "number" && Number.isFinite(pendingDelta)
      ? Math.max(0, shiftSum + pendingDelta)
      : shiftSum;

  const pct = shiftCap > 0 ? Math.min(1, projected / shiftCap) : 0;
  const pctDisplay = Math.round(pct * 100);
  const willExceed = projected >= shiftCap;

  const tone: ProgressTone =
    pct >= 0.9 || willExceed
      ? "destructive"
      : pct >= 0.7
        ? "warning"
        : "success";

  const wrapTone =
    pct >= 0.9 || willExceed
      ? "border-destructive/40 bg-destructive/10"
      : pct >= 0.7
        ? "border-warning/40 bg-warning/10"
        : "border-muted";

  return (
    <div
      className={cn(
        "rounded-md border p-3 text-xs space-y-1.5",
        wrapTone,
        className,
      )}
      data-slot="shift-cap-meter"
      data-tone={tone}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium">
          Shift cap người dùng
          {shiftLabel ? (
            <span className="ml-1 text-muted-foreground">({shiftLabel})</span>
          ) : null}
        </div>
        <div className="tabular-nums">
          {formatVND(projected)} / {formatVND(shiftCap)}
          <span className="ml-1 text-muted-foreground">{pctDisplay}%</span>
        </div>
      </div>
      <Progress value={pctDisplay} tone={tone} className="h-1.5 rounded-full" />
      {willExceed ? (
        <p className="text-destructive">
          ⚠ Phiếu này sẽ trigger tier 2 → QLV phải duyệt
        </p>
      ) : pct >= 0.7 ? (
        <p className="text-warning-foreground">
          Gần cap — thêm{" "}
          {formatVND(shiftCap - projected)} nữa sẽ cần duyệt
        </p>
      ) : null}
    </div>
  );
}
