"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";

interface YearPickerProps {
  selectedYear: number;
  currentYear: number;
}

export function YearPicker({ selectedYear, currentYear }: YearPickerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const isCurrent = selectedYear === currentYear;
  const canGoNext = selectedYear < currentYear;

  function go(year: number) {
    startTransition(() => {
      const params = new URLSearchParams();
      if (year !== currentYear) params.set("year", String(year));
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
        aria-label="Năm trước"
        disabled={isPending}
        onClick={() => go(selectedYear - 1)}
      >
        <IconChevronLeft />
      </Button>
      <div className="flex flex-1 flex-col items-center gap-0.5">
        <p className="text-sm font-medium">Năm {selectedYear}</p>
        {!isCurrent ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={isPending}
            onClick={() => go(currentYear)}
          >
            {isPending ? <Spinner className="mr-1" /> : null}
            Năm hiện tại
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">
            {isPending ? "Đang tải…" : "Năm hiện tại"}
          </span>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label="Năm sau"
        disabled={isPending || !canGoNext}
        onClick={() => go(selectedYear + 1)}
      >
        <IconChevronRight />
      </Button>
    </div>
  );
}
