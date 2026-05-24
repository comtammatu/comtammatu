"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";

interface MonthPickerProps {
  selectedMonth: string;
  currentMonth: string;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

function formatLabel(month: string): string {
  const [y, m] = month.split("-");
  return `Tháng ${m}/${y}`;
}

export function MonthPicker({ selectedMonth, currentMonth }: MonthPickerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const isCurrent = selectedMonth === currentMonth;
  const next = shiftMonth(selectedMonth, 1);
  const canGoNext = next <= currentMonth;

  function go(month: string) {
    startTransition(() => {
      const params = new URLSearchParams();
      if (month !== currentMonth) params.set("month", month);
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "?");
    });
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border bg-card p-2">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label="Tháng trước"
        disabled={isPending}
        onClick={() => go(shiftMonth(selectedMonth, -1))}
      >
        <IconChevronLeft />
      </Button>
      <div className="flex flex-1 flex-col items-center gap-0.5">
        <p className="text-sm font-medium">{formatLabel(selectedMonth)}</p>
        {!isCurrent ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={isPending}
            onClick={() => go(currentMonth)}
          >
            {isPending ? <Spinner className="mr-1" /> : null}
            Tháng này
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">
            {isPending ? "Đang tải…" : "Tháng hiện tại"}
          </span>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label="Tháng sau"
        disabled={isPending || !canGoNext}
        onClick={() => go(next)}
      >
        <IconChevronRight />
      </Button>
    </div>
  );
}
