"use client";

import { useRef } from "react";
import { formatVND } from "@comtammatu/shared/format";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";

export const DENOMINATIONS = [
  500_000, 200_000, 100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000,
] as const;

export type DenominationCounts = Record<number, number>;

export function sumDenominations(counts: DenominationCounts): number {
  return DENOMINATIONS.reduce(
    (total, d) => total + d * (counts[d] ?? 0),
    0,
  );
}

interface DenominationInputProps {
  counts: DenominationCounts;
  onCountsChange: (counts: DenominationCounts) => void;
  disabled?: boolean;
}

export function DenominationInput({
  counts,
  onCountsChange,
  disabled,
}: DenominationInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const setCount = (denom: number, raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    const next = { ...counts };
    if (!Number.isFinite(parsed) || parsed <= 0) {
      delete next[denom];
    } else {
      next[denom] = parsed;
    }
    onCountsChange(next);
  };

  const focusNext = (index: number) => {
    const next = inputRefs.current[index + 1];
    if (next) next.focus();
  };

  const total = sumDenominations(counts);

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Đếm tiền mặt theo mệnh giá
        </p>
        <p className="text-xs text-muted-foreground">Enter để sang dòng kế</p>
      </div>
      <div className="flex flex-col gap-2">
        {DENOMINATIONS.map((denom, index) => {
          const count = counts[denom] ?? 0;
          const subtotal = denom * count;
          return (
            <div key={denom} className="flex items-center gap-2">
              <Label
                htmlFor={`denom-${String(denom)}`}
                className="w-20 shrink-0 text-sm font-semibold tabular-nums"
              >
                {formatVND(denom)}
              </Label>
              <span className="text-xs text-muted-foreground">×</span>
              <Input
                id={`denom-${String(denom)}`}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                disabled={disabled}
                value={count === 0 ? "" : String(count)}
                onChange={(e) => setCount(denom, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    focusNext(index);
                  }
                }}
                placeholder="0"
                className="h-10 w-20 text-center tabular-nums"
              />
              <span className="flex-1 text-right text-sm tabular-nums text-muted-foreground">
                {subtotal > 0 ? formatVND(subtotal) : "—"}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between border-t pt-3">
        <span className="text-sm font-semibold">Tổng đếm được</span>
        <span className="text-lg font-bold tabular-nums text-primary">
          {formatVND(total)}
        </span>
      </div>
    </div>
  );
}
