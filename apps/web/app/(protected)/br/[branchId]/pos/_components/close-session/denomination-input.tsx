"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: POS cash denomination entry keeps cashier-facing copy inline */

import { useRef } from "react";
import { formatVND } from "@comtammatu/shared/format";
import { Label } from "@comtammatu/ui/components/label";
import { FormattedNumberInput } from "@/components/form";
import { StationSection } from "@/components/surface";

const DENOMINATIONS = [
  500_000, 200_000, 100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000,
] as const;

export type DenominationCounts = Record<number, number>;

export function sumDenominations(counts: DenominationCounts): number {
  return DENOMINATIONS.reduce((total, d) => total + d * (counts[d] ?? 0), 0);
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
    <StationSection
      size="sm"
      title="Đếm tiền mặt theo mệnh giá"
      headerHint="Enter để sang dòng kế"
      contentClassName="gap-2"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-base font-semibold">Tổng đếm được</span>
          <span className="text-lg font-bold tabular-nums text-primary">
            {formatVND(total)}
          </span>
        </div>
      }
    >
      <>
        {DENOMINATIONS.map((denom, index) => {
          const count = counts[denom] ?? 0;
          const subtotal = denom * count;
          return (
            <div key={denom} className="flex items-center gap-2">
              <Label
                htmlFor={`denom-${String(denom)}`}
                className="w-20 shrink-0 text-base font-semibold tabular-nums"
              >
                {formatVND(denom)}
              </Label>
              <span className="text-sm text-muted-foreground">×</span>
              <FormattedNumberInput
                id={`denom-${String(denom)}`}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                maxFractionDigits={0}
                disabled={disabled}
                value={count === 0 ? "" : String(count)}
                onValueChange={(value) => setCount(denom, value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    focusNext(index);
                  }
                }}
                placeholder="0"
                className="h-10 w-20 text-center tabular-nums"
              />
              <span className="flex-1 text-right text-base tabular-nums text-muted-foreground">
                {subtotal > 0 ? formatVND(subtotal) : "—"}
              </span>
            </div>
          );
        })}
      </>
    </StationSection>
  );
}
