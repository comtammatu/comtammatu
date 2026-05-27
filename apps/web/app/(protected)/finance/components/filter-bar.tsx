"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { cn } from "@comtammatu/ui/lib/utils";
import { messages } from "@lib/messages";
import {
  FINANCE_RANGES,
  type FinanceCompareMode,
  type FinanceGranularity,
  type FinanceParams,
  type FinancePayment,
  type FinanceRange,
  getPresetRange,
  serializeFinanceParams,
} from "../_lib/finance-params";

// FilterBar = single source of truth for the URL state. Preset chips
// push immediately (one click = filter applied); custom date inputs
// require an explicit Apply because the keystroke stream would
// otherwise spam router.replace.
//
// The bar reads + writes URL params via serializeFinanceParams. Server
// Component sees the new URL on next render and re-fetches; Client
// state stays in sync via the params prop (parent passes the parsed
// FinanceParams down).

interface AccessibleBranch {
  id: number;
  name: string;
}

interface FilterBarProps {
  params: FinanceParams;
  branches: AccessibleBranch[];
  /** Pathname to push (e.g. "/finance/revenue", "/finance/reconciliation") */
  basePath: string;
  /** Optional route-specific preset subset. Defaults to the full Finance set. */
  ranges?: ReadonlyArray<FinanceRange>;
  /** Hide controls that don't apply to a given route. Default: all visible. */
  hide?: ReadonlyArray<FilterBarControl>;
  className?: string;
}

export type FilterBarControl =
  | "branch"
  | "range"
  | "granularity"
  | "compare"
  | "payment";

const ALL_BRANCHES_VALUE = "all";

const filterCopy = messages.finance.filterBar;

const RANGE_LABEL: Record<FinanceRange, string> = {
  today: filterCopy.rangeToday,
  yesterday: filterCopy.rangeYesterday,
  "7d": filterCopy.range7d,
  "30d": filterCopy.range30d,
  mtd: filterCopy.rangeMtd,
  last_month: filterCopy.rangeLastMonth,
  qtd: filterCopy.rangeQtd,
  ytd: filterCopy.rangeYtd,
  custom: filterCopy.rangeCustom,
};

const COMPARE_LABEL: Record<FinanceCompareMode, string> = {
  none: filterCopy.compareNone,
  prev_period: filterCopy.comparePrevPeriod,
  prev_week: filterCopy.comparePrevWeek,
  prev_month: filterCopy.comparePrevMonth,
  prev_year: filterCopy.comparePrevYear,
};

const PAYMENT_LABEL: Record<FinancePayment, string> = {
  all: filterCopy.paymentAll,
  cash: filterCopy.paymentCash,
  vietqr: filterCopy.paymentVietqr,
  momo: filterCopy.paymentMomo,
};

const GRANULARITY_LABEL: Record<FinanceGranularity, string> = {
  day: filterCopy.granularityDay,
  week: filterCopy.granularityWeek,
  month: filterCopy.granularityMonth,
};

export function FilterBar({
  params,
  branches,
  basePath,
  ranges = FINANCE_RANGES,
  hide = [],
  className,
}: FilterBarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Local draft for custom date range — only pushed on Apply click. All
  // other controls push immediately on change.
  const presetRange = useMemo(
    () =>
      getPresetRange(params.range, new Date(), {
        from: params.from,
        to: params.to,
      }),
    [params.range, params.from, params.to],
  );
  const [draftFrom, setDraftFrom] = useState(presetRange.start);
  const [draftTo, setDraftTo] = useState(presetRange.end);

  useEffect(() => {
    setDraftFrom(presetRange.start);
    setDraftTo(presetRange.end);
  }, [presetRange.start, presetRange.end]);

  function pushParams(next: Partial<FinanceParams>) {
    const merged: FinanceParams = { ...params, ...next };
    const usp = serializeFinanceParams(merged);
    const qs = usp.toString();
    startTransition(() => {
      router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
    });
  }

  function handleBranchChange(value: string) {
    const branch = value === ALL_BRANCHES_VALUE ? null : Number(value);
    pushParams({ branch });
  }

  function handleRangeChange(next: FinanceRange) {
    if (next === "custom") {
      // Seed the custom inputs with whatever range was last shown so
      // the user picks up where they were.
      pushParams({
        range: "custom",
        from: draftFrom,
        to: draftTo,
      });
    } else {
      pushParams({ range: next, from: null, to: null });
    }
  }

  function handleApplyCustom() {
    if (draftFrom > draftTo) {
      // Swap so users who type backward dates still get a valid range.
      pushParams({ range: "custom", from: draftTo, to: draftFrom });
    } else {
      pushParams({ range: "custom", from: draftFrom, to: draftTo });
    }
  }

  const branchValue =
    params.branch == null ? ALL_BRANCHES_VALUE : String(params.branch);
  const showBranch = !hide.includes("branch");
  const showRange = !hide.includes("range");
  const showGranularity = !hide.includes("granularity");
  const showCompare = !hide.includes("compare");
  const showPayment = !hide.includes("payment");

  return (
    <Card size="sm" className={className}>
      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {showBranch && (
            <div className="grid gap-1.5">
              <Label className="text-xs">{filterCopy.branch}</Label>
              <Select
                value={branchValue}
                onValueChange={handleBranchChange}
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder={filterCopy.branchPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_BRANCHES_VALUE}>
                    {messages.finance.common.allBranches}
                  </SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showRange && (
            <div className="grid gap-1.5">
              <Label className="text-xs">{filterCopy.range}</Label>
              <Select
                value={params.range}
                onValueChange={(v) => handleRangeChange(v as FinanceRange)}
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ranges.map((range) => (
                    <SelectItem key={range} value={range}>
                      {RANGE_LABEL[range]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showGranularity && (
            <div className="grid gap-1.5">
              <Label className="text-xs">{filterCopy.granularity}</Label>
              <Tabs
                value={params.gran}
                onValueChange={(v) =>
                  pushParams({ gran: v as FinanceGranularity })
                }
              >
                <TabsList className={cn("w-full", isPending && "opacity-60")}>
                  <TabsTrigger value="day" className="flex-1">
                    {GRANULARITY_LABEL.day}
                  </TabsTrigger>
                  <TabsTrigger value="week" className="flex-1">
                    {GRANULARITY_LABEL.week}
                  </TabsTrigger>
                  <TabsTrigger value="month" className="flex-1">
                    {GRANULARITY_LABEL.month}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}

          {showCompare && (
            <div className="grid gap-1.5">
              <Label className="text-xs">{filterCopy.compare}</Label>
              <Select
                value={params.compare}
                onValueChange={(v) =>
                  pushParams({ compare: v as FinanceCompareMode })
                }
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(COMPARE_LABEL) as FinanceCompareMode[]).map(
                    (mode) => (
                      <SelectItem key={mode} value={mode}>
                        {COMPARE_LABEL[mode]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {showPayment && (
            <div className="grid gap-1.5">
              <Label className="text-xs">{filterCopy.payment}</Label>
              <Select
                value={params.payment}
                onValueChange={(v) =>
                  pushParams({ payment: v as FinancePayment })
                }
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PAYMENT_LABEL) as FinancePayment[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PAYMENT_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {showRange && params.range === "custom" ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <div className="grid gap-1.5">
              <Label htmlFor="finance-from" className="text-xs">
                {filterCopy.fromDate}
              </Label>
              <Input
                id="finance-from"
                type="date"
                value={draftFrom}
                onChange={(e) => setDraftFrom(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="finance-to" className="text-xs">
                {filterCopy.toDate}
              </Label>
              <Input
                id="finance-to"
                type="date"
                value={draftTo}
                onChange={(e) => setDraftTo(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                size="sm"
                onClick={handleApplyCustom}
                disabled={
                  isPending ||
                  (draftFrom === presetRange.start &&
                    draftTo === presetRange.end)
                }
              >
                {filterCopy.apply}
              </Button>
            </div>
          </div>
        ) : null}

        {/* Resolved range summary — gives owner instant confirmation
            of what window they're looking at */}
        <p className="border-t pt-3 text-xs text-muted-foreground">
          {filterCopy.rangeSummary}{" "}
          <span className="font-medium tabular-nums text-foreground">
            {presetRange.start} → {presetRange.end}
          </span>
          {showCompare && params.compare !== "none" ? (
            <span> · {COMPARE_LABEL[params.compare]}</span>
          ) : null}
          {showPayment && params.payment !== "all" ? (
            <span> · {PAYMENT_LABEL[params.payment]}</span>
          ) : null}
        </p>
      </CardContent>
    </Card>
  );
}
