"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { messages } from "@lib/messages";
import { BranchOperatorControlBar } from "@lib/branch-operator/components/branch-operator-page";
import { EmployeeControlBar } from "../components/staff-runtime-page";

const copy = messages.employee.payslip;

type PayslipPlane = "employee" | "branch";

interface YearPickerProps {
  selectedYear: number;
  currentYear: number;
  plane?: PayslipPlane;
}

export function YearPicker({
  selectedYear,
  currentYear,
  plane = "employee",
}: YearPickerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const ControlBar =
    plane === "branch" ? BranchOperatorControlBar : EmployeeControlBar;

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
    <ControlBar>
      <Button
        type="button"
        variant="outline"
        size="icon-touch"
        aria-label={copy.previousYearAria}
        disabled={isPending}
        onClick={() => go(selectedYear - 1)}
      >
        <IconChevronLeft />
      </Button>
      <div className="flex flex-1 flex-col items-center gap-1">
        <p className="text-sm font-medium">
          {copy.yearBadge} {selectedYear}
        </p>
        {!isCurrent ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={isPending}
            onClick={() => go(currentYear)}
          >
            {isPending ? <Spinner data-icon="inline-start" /> : null}
            {copy.currentYear}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">
            {isPending ? copy.loading : copy.currentYear}
          </span>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon-touch"
        aria-label={copy.nextYearAria}
        disabled={isPending || !canGoNext}
        onClick={() => go(selectedYear + 1)}
      >
        <IconChevronRight />
      </Button>
    </ControlBar>
  );
}
