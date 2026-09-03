"use client";

import { type ReactNode, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { cn } from "@comtammatu/ui/lib/utils";
import { formatVNBusinessDate } from "@comtammatu/shared/time";
import { BusinessDatePicker } from "@/components/form";
import { useFormControlSize } from "@/components/form/control-size";
import { AppToolbar } from "@/components/surface";
import { messages } from "@lib/messages";
import {
  FINANCE_OVERVIEW_PERIODS,
  type FinanceCalendarPeriod,
  type FinanceCompareMode,
  type FinanceGranularity,
  type FinanceOverviewPeriod,
  type FinanceParams,
  getFinanceCalendarPeriodSelection,
  getPresetRange,
  mergePreservedFinanceSearch,
  resolveFinanceCalendarPeriod,
  serializeFinanceParams,
} from "../_lib/finance-params";
import { FinanceCalendarPeriodPicker } from "./finance-calendar-period-picker";
import {
  financeFilterCompareTriggerClassName,
  financeFilterDatePickerClassName,
  financeFilterGranularityTriggerClassName,
  financeFilterPeriodPickerClassName,
  financeFilterRangeTriggerClassName,
} from "./finance-list-filters";

interface AccessibleBranch {
  id: number;
  name: string;
}

interface FilterBarProps {
  params: FinanceParams;
  branches: AccessibleBranch[];
  basePath: string;
  locationFilter?: boolean;
  hide?: ReadonlyArray<FilterBarControl>;
  search?: ReactNode;
  extraFilters?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  branchLabel?: string;
  branchPlaceholder?: string;
  allBranchesLabel?: string;
  /** Prefer `inline` inside AppListFrame toolbar; default card for REPORT siblings. */
  variant?: "card" | "inline";
  /** Stick at Owner scrollport top when not already inside AppListFrame toolbar. */
  sticky?: boolean;
}

type FilterBarControl = "branch" | "range" | "granularity" | "compare";

const ALL_BRANCHES_VALUE = "all";
const filterCopy = messages.finance.filterBar;

const PERIOD_LABEL: Record<FinanceOverviewPeriod, string> = {
  today: filterCopy.rangeToday,
  yesterday: filterCopy.rangeYesterday,
  week: filterCopy.rangeWeek,
  month: filterCopy.rangeMonth,
  quarter: filterCopy.rangeQuarter,
  year: filterCopy.rangeYear,
  custom: filterCopy.rangeCustom,
};

const PERIOD_PICKER_LABEL: Record<FinanceCalendarPeriod, string> = {
  week: filterCopy.pickWeek,
  month: filterCopy.pickMonth,
  quarter: filterCopy.pickQuarter,
  year: filterCopy.pickYear,
};

const LOCATION_SCOPE_ORDER = ["all", "company", "branches"] as const;
type FinanceLocationScope = (typeof LOCATION_SCOPE_ORDER)[number];

const LOCATION_LABEL: Record<FinanceLocationScope, string> = {
  all: filterCopy.locationAll,
  company: filterCopy.locationCompany,
  branches: filterCopy.locationAllBranches,
};

const COMPARE_LABEL: Record<FinanceCompareMode, string> = {
  none: filterCopy.compareNone,
  prev_period: filterCopy.comparePrevPeriod,
  prev_week: filterCopy.comparePrevWeek,
  prev_month: filterCopy.comparePrevMonth,
  prev_year: filterCopy.comparePrevYear,
};

const GRANULARITY_LABEL: Record<FinanceGranularity, string> = {
  day: filterCopy.granularityDay,
  week: filterCopy.granularityWeek,
  month: filterCopy.granularityMonth,
};

function resolveSelectedPeriod(params: FinanceParams): FinanceOverviewPeriod {
  if (params.range === "today" || params.range === "yesterday") {
    return params.range;
  }
  if (params.range === "custom" && params.period) return params.period;
  if (params.range === "custom") return "custom";
  if (params.range === "7d") return "week";
  if (params.range === "qtd") return "quarter";
  if (params.range === "ytd") return "year";
  return "month";
}

export function FilterBar({
  params,
  branches,
  basePath,
  locationFilter = false,
  hide = [],
  search,
  extraFilters,
  trailing,
  className,
  branchLabel = filterCopy.branch,
  branchPlaceholder = filterCopy.branchPlaceholder,
  allBranchesLabel = messages.finance.common.allBranches,
  variant = "card",
  sticky = false,
}: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const controlSize = useFormControlSize();
  const optionSize = controlSize === "touch" ? "touch" : "default";
  const [isPending, startTransition] = useTransition();
  const selectedPeriod = resolveSelectedPeriod(params);
  const calendarPeriod: FinanceCalendarPeriod | null =
    selectedPeriod === "today" ||
    selectedPeriod === "yesterday" ||
    selectedPeriod === "custom"
      ? null
      : selectedPeriod;
  const resolvedRange = getPresetRange(params.range, new Date(), {
    from: params.from,
    to: params.to,
  });
  const periodSelection = calendarPeriod
    ? getFinanceCalendarPeriodSelection(calendarPeriod, resolvedRange)
    : "";
  const today = getPresetRange("today");

  function pushParams(next: Partial<FinanceParams>) {
    const financeSearch = serializeFinanceParams({ ...params, ...next });
    const search = mergePreservedFinanceSearch(
      financeSearch,
      new URLSearchParams(searchParams.toString()),
    ).toString();
    startTransition(() => {
      router.replace(search ? `${basePath}?${search}` : basePath, {
        scroll: false,
      });
    });
  }

  function handleBranchChange(value: string) {
    const branch = value === ALL_BRANCHES_VALUE ? null : Number(value);
    if (branch != null && !branches.some((item) => item.id === branch)) return;
    pushParams({ location: branch == null ? "all" : "branch", branch });
  }

  function handleLocationChange(value: string) {
    if (value.startsWith("branch:")) {
      const branch = Number(value.slice("branch:".length));
      if (!branches.some((item) => item.id === branch)) return;
      pushParams({ location: "branch", branch });
      return;
    }
    if (LOCATION_SCOPE_ORDER.some((location) => location === value)) {
      pushParams({ location: value as FinanceLocationScope, branch: null });
    }
  }

  function handlePeriodChange(period: FinanceOverviewPeriod) {
    if (period === "today" || period === "yesterday") {
      pushParams({ range: period, period: null, from: null, to: null });
      return;
    }
    if (period === "custom") {
      pushParams({
        range: "custom",
        period: null,
        from: resolvedRange.start,
        to: resolvedRange.end,
      });
      return;
    }
    const selection = getFinanceCalendarPeriodSelection(period, today);
    const range = resolveFinanceCalendarPeriod(period, selection);
    if (!range) return;
    pushParams({
      range: "custom",
      period,
      from: range.start,
      to: range.end,
    });
  }

  function handlePeriodSelectionChange(selection: string) {
    if (!calendarPeriod || !selection) return;
    const range = resolveFinanceCalendarPeriod(calendarPeriod, selection);
    if (!range) return;
    pushParams({
      range: "custom",
      period: calendarPeriod,
      from: range.start,
      to: range.end,
    });
  }

  function handleCustomDateChange(next: { from?: string; to?: string }) {
    const from = next.from ?? resolvedRange.start;
    const to = next.to ?? resolvedRange.end;
    if (!from || !to) return;
    const start = from <= to ? from : to;
    const end = from <= to ? to : from;
    const todayStr = today.start;
    pushParams({
      range: "custom",
      period: null,
      from: start > todayStr ? todayStr : start,
      to: end > todayStr ? todayStr : end,
    });
  }

  const locationValue =
    params.location === "branch" && params.branch != null
      ? `branch:${String(params.branch)}`
      : params.location;
  const branchValue =
    params.branch == null ? ALL_BRANCHES_VALUE : String(params.branch);
  const showBranch = !hide.includes("branch");
  const showRange = !hide.includes("range");
  const showGranularity = !hide.includes("granularity");
  const showCompare = !hide.includes("compare");
  const periodDisplay = calendarPeriod
    ? calendarPeriod === "week"
      ? `Tuần ${periodSelection.slice(-2)}/${periodSelection.slice(0, 4)} · ${formatVNBusinessDate(resolvedRange.start)}–${formatVNBusinessDate(resolvedRange.end)}`
      : calendarPeriod === "month"
        ? `Tháng ${Number(periodSelection.slice(5, 7))}/${periodSelection.slice(0, 4)}`
        : calendarPeriod === "quarter"
          ? `Quý ${periodSelection.slice(-1)}/${periodSelection.slice(0, 4)}`
          : `Năm ${periodSelection}`
    : undefined;

  return (
    <AppToolbar
      variant={variant}
      sticky={sticky}
      className={cn(
        "flex-col items-stretch gap-2 lg:flex-row lg:flex-nowrap lg:items-center",
        className,
      )}
    >
      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center lg:flex-nowrap">
        {search ? (
          <div className="col-span-2 min-w-0 sm:min-w-64 sm:flex-1">{search}</div>
        ) : null}
        {extraFilters}
        {showBranch && locationFilter ? (
          <Select
            value={locationValue}
            onValueChange={handleLocationChange}
            disabled={isPending}
          >
            <SelectTrigger
              aria-label={filterCopy.location}
              size={controlSize}
              className="w-full sm:w-56"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCATION_SCOPE_ORDER.map((location) => (
                <SelectItem key={location} value={location} size={optionSize}>
                  {LOCATION_LABEL[location]}
                </SelectItem>
              ))}
              {branches.map((branch) => (
                <SelectItem
                  key={branch.id}
                  value={`branch:${String(branch.id)}`}
                  size={optionSize}
                >
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : showBranch ? (
          <Select
            value={branchValue}
            onValueChange={handleBranchChange}
            disabled={isPending}
          >
            <SelectTrigger
              aria-label={branchLabel}
              size={controlSize}
              className="w-full sm:w-44"
            >
              <SelectValue placeholder={branchPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_BRANCHES_VALUE} size={optionSize}>
                {allBranchesLabel}
              </SelectItem>
              {branches.map((branch) => (
                <SelectItem
                  key={branch.id}
                  value={String(branch.id)}
                  size={optionSize}
                >
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {showRange ? (
          <Select
            value={selectedPeriod}
            onValueChange={(value) =>
              handlePeriodChange(value as FinanceOverviewPeriod)
            }
            disabled={isPending}
          >
            <SelectTrigger
              aria-label={filterCopy.range}
              size={controlSize}
              className={financeFilterRangeTriggerClassName}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FINANCE_OVERVIEW_PERIODS.map((period) => (
                <SelectItem key={period} value={period} size={optionSize}>
                  {PERIOD_LABEL[period]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {showRange && calendarPeriod ? (
          <FinanceCalendarPeriodPicker
            id="finance-period-picker"
            aria-label={PERIOD_PICKER_LABEL[calendarPeriod]}
            period={calendarPeriod}
            selection={periodSelection}
            displayValue={periodDisplay}
            placeholder={PERIOD_PICKER_LABEL[calendarPeriod]}
            max={today.start}
            disabled={isPending}
            className={cn("col-span-2 sm:col-span-1", financeFilterPeriodPickerClassName)}
            onSelectionChange={handlePeriodSelectionChange}
          />
        ) : null}

        {showRange && selectedPeriod === "custom" ? (
          <>
            <BusinessDatePicker
              id="finance-range-from"
              aria-label={filterCopy.fromDate}
              placeholder={filterCopy.fromDate}
              value={resolvedRange.start}
              max={
                resolvedRange.end > today.start
                  ? today.start
                  : resolvedRange.end
              }
              captionLayout="dropdown"
              disabled={isPending}
              className={financeFilterDatePickerClassName}
              onValueChange={(value) => {
                if (!value) return;
                handleCustomDateChange({ from: value });
              }}
            />
            <BusinessDatePicker
              id="finance-range-to"
              aria-label={filterCopy.toDate}
              placeholder={filterCopy.toDate}
              value={resolvedRange.end}
              min={resolvedRange.start}
              max={today.start}
              captionLayout="dropdown"
              disabled={isPending}
              className={financeFilterDatePickerClassName}
              onValueChange={(value) => {
                if (!value) return;
                handleCustomDateChange({ to: value });
              }}
            />
          </>
        ) : null}

        {showGranularity ? (
          <Select
            value={params.gran}
            onValueChange={(value) =>
              pushParams({ gran: value as FinanceGranularity })
            }
            disabled={isPending}
          >
            <SelectTrigger
              aria-label={filterCopy.granularity}
              size={controlSize}
              className={financeFilterGranularityTriggerClassName}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(GRANULARITY_LABEL) as FinanceGranularity[]).map(
                (granularity) => (
                  <SelectItem
                    key={granularity}
                    value={granularity}
                    size={optionSize}
                  >
                    {GRANULARITY_LABEL[granularity]}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        ) : null}

        {showCompare ? (
          <Select
            value={params.compare}
            onValueChange={(value) =>
              pushParams({ compare: value as FinanceCompareMode })
            }
            disabled={isPending}
          >
            <SelectTrigger
              aria-label={filterCopy.compare}
              size={controlSize}
              className={financeFilterCompareTriggerClassName}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(COMPARE_LABEL) as FinanceCompareMode[]).map(
                (mode) => (
                  <SelectItem key={mode} value={mode} size={optionSize}>
                    {COMPARE_LABEL[mode]}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        ) : null}

        {trailing ? (
          <div className="col-span-2 sm:col-span-1 flex items-center">{trailing}</div>
        ) : null}
      </div>
    </AppToolbar>
  );
}
