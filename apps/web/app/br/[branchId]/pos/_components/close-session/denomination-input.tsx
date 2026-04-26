"use client";

import { useRef } from "react";
import { formatVND } from "@comtammatu/shared/format";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { Label } from "@comtammatu/ui/components/label";
import { FormattedNumberInput } from "@/components/form";

export const DENOMINATIONS = [
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
    <Card size="sm">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
          Đếm tiền mặt theo mệnh giá
        </CardTitle>
        <p className="text-sm text-muted-foreground">Enter để sang dòng kế</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
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
      </CardContent>
      <CardFooter className="justify-between border-t">
        <span className="text-base font-semibold">Tổng đếm được</span>
        <span className="text-lg font-bold tabular-nums text-primary">
          {formatVND(total)}
        </span>
      </CardFooter>
    </Card>
  );
}
