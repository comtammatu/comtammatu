import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  FINANCE_LOCATIONS,
  FINANCE_OVERVIEW_PERIODS,
  getFinanceCalendarPeriodSelection,
  getPresetRange,
  parseFinanceParams,
  resolveFinanceCalendarPeriod,
  serializeFinanceParams,
} from "../app/(protected)/finance/_lib/finance-params";

const now = new Date("2026-08-02T05:00:00.000Z");

describe("Finance overview period filter", () => {
  it("keeps the four location scopes distinct in the URL and query boundary", () => {
    assert.deepEqual(FINANCE_LOCATIONS, [
      "all",
      "company",
      "branches",
      "branch",
    ]);
    assert.equal(parseFinanceParams({}).location, "all");
    assert.equal(
      parseFinanceParams({ location: "company" }).location,
      "company",
    );
    assert.equal(
      parseFinanceParams({ location: "branches" }).location,
      "branches",
    );
    const branchParams = parseFinanceParams({ branch: "12" });
    assert.equal(branchParams.location, "branch");
    assert.equal(branchParams.branch, 12);
    assert.equal(
      serializeFinanceParams(
        parseFinanceParams({ location: "company" }),
      ).toString(),
      "branch=company&location=company",
    );
    assert.equal(
      serializeFinanceParams(
        parseFinanceParams({ location: "branches" }),
      ).toString(),
      "branch=branches&location=branches",
    );
    assert.equal(
      serializeFinanceParams(parseFinanceParams({ branch: "12" })).toString(),
      "branch=12",
    );
    assert.equal(parseFinanceParams({ branch: "company" }).location, "company");
    assert.equal(
      parseFinanceParams({ branch: "branches" }).location,
      "branches",
    );

    const page = readFileSync(
      new URL("../app/(protected)/finance/page.tsx", import.meta.url),
      "utf8",
    );
    const filterBar = readFileSync(
      new URL(
        "../app/(protected)/finance/components/filter-bar.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const cockpit = readFileSync(
      new URL(
        "../app/(protected)/finance/_lib/finance-cockpit.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const shell = readFileSync(
      new URL("../app/components/control-surface-shell.tsx", import.meta.url),
      "utf8",
    );
    assert.match(page, /locationFilter/);
    assert.match(page, /hide=\{\["granularity", "compare"\]\}/);
    assert.match(shell, /ControlSurfaceScopeControl/);
    assert.match(
      filterBar,
      /LOCATION_SCOPE_ORDER = \["all", "company", "branches"\]/,
    );
    assert.match(filterBar, /value=\{`branch:\$\{String\(branch\.id\)\}`\}/);
    assert.doesNotMatch(filterBar, /filterCopy\.locationBranch/);
    assert.doesNotMatch(
      filterBar,
      /locationFilter && params\.location === "branch"/,
    );
    // Startup-capital scoping moved into get_finance_startup_capital_summary:
    // company stays NULL-branch-only inside the RPC, never a client filter.
    assert.match(cockpit, /get_finance_startup_capital_summary/);
    const startupCapitalMigration = readFileSync(
      new URL(
        "../../../supabase/migrations/20260824013553_finance_startup_capital_summary_rpc.sql",
        import.meta.url,
      ),
      "utf8",
    );
    assert.match(
      startupCapitalMigration,
      /WHEN 'company' THEN expense\.branch_id IS NULL/,
    );
    assert.match(cockpit, /get_finance_operating_cockpit/);
    const operatingCockpitMigration = readFileSync(
      new URL(
        "../../../supabase/migrations/20260820151657_finance_operating_cockpit_and_stop_mv_food_cost.sql",
        import.meta.url,
      ),
      "utf8",
    );
    assert.match(operatingCockpitMigration, /invoice\.grn_id IS NULL/);
  });

  it("offers the seven approved period choices on the overview", () => {
    assert.deepEqual(FINANCE_OVERVIEW_PERIODS, [
      "today",
      "yesterday",
      "week",
      "month",
      "quarter",
      "year",
      "custom",
    ]);

    const page = readFileSync(
      new URL("../app/(protected)/finance/page.tsx", import.meta.url),
      "utf8",
    );
    const filterBar = readFileSync(
      new URL(
        "../app/(protected)/finance/components/filter-bar.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    assert.match(page, /<FilterBar[\s\S]*?locationFilter/);
    assert.match(filterBar, /FINANCE_OVERVIEW_PERIODS\.map/);
    assert.match(filterBar, /lg:flex-row lg:flex-nowrap lg:items-center/);
    assert.match(filterBar, /<FinanceCalendarPeriodPicker/);
    assert.match(filterBar, /selectedPeriod === "custom"/);
    assert.match(filterBar, /<BusinessDatePicker/);
    assert.match(filterBar, /filterCopy\.rangeCustom/);
    assert.match(filterBar, /captionLayout="dropdown"/);
    assert.doesNotMatch(filterBar, /type="(?:date|month|week)"/);
    assert.doesNotMatch(filterBar, /datetime-local|type="time"/);
    assert.match(
      readFileSync(
        new URL(
          "../app/(protected)/finance/components/finance-calendar-period-picker.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      /period === "month"[\s\S]*?monthShort[\s\S]*?period === "quarter"[\s\S]*?quarterOption[\s\S]*?period === "year"/,
    );
    assert.match(
      readFileSync(
        new URL(
          "../app/(protected)/finance/components/finance-calendar-period-picker.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      /period === "week"[\s\S]*?<BusinessWeekPicker/,
    );
  });

  it("uses the shared period picker across Finance filter surfaces", () => {
    const routes = [
      "../app/(protected)/finance/revenue/revenue-client.tsx",
      "../app/(protected)/finance/food-cost/food-cost-client.tsx",
      "../app/(protected)/finance/expenses/expenses-client.tsx",
      "../app/(protected)/finance/bank-transactions/bank-transactions-table.tsx",
    ];
    for (const route of routes) {
      assert.match(
        readFileSync(new URL(route, import.meta.url), "utf8"),
        /<FilterBar/,
      );
    }

    const targets = readFileSync(
      new URL(
        "../app/(protected)/finance/targets/targets-client.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    assert.match(targets, /<BusinessDatePicker/);
    assert.doesNotMatch(targets, /type="month"/);
  });

  it("resolves current calendar periods through today in Vietnam time", () => {
    assert.deepEqual(resolveFinanceCalendarPeriod("week", "2026-W31", now), {
      start: "2026-07-27",
      end: "2026-08-02",
    });
    assert.deepEqual(resolveFinanceCalendarPeriod("month", "2026-08", now), {
      start: "2026-08-01",
      end: "2026-08-02",
    });
    assert.deepEqual(resolveFinanceCalendarPeriod("quarter", "2026-Q3", now), {
      start: "2026-07-01",
      end: "2026-08-02",
    });
    assert.deepEqual(resolveFinanceCalendarPeriod("year", "2026", now), {
      start: "2026-01-01",
      end: "2026-08-02",
    });
  });

  it("resolves past periods in full and rejects future periods", () => {
    assert.deepEqual(resolveFinanceCalendarPeriod("week", "2026-W30", now), {
      start: "2026-07-20",
      end: "2026-07-26",
    });
    assert.deepEqual(resolveFinanceCalendarPeriod("month", "2026-07", now), {
      start: "2026-07-01",
      end: "2026-07-31",
    });
    assert.deepEqual(resolveFinanceCalendarPeriod("quarter", "2026-Q2", now), {
      start: "2026-04-01",
      end: "2026-06-30",
    });
    assert.deepEqual(resolveFinanceCalendarPeriod("year", "2025", now), {
      start: "2025-01-01",
      end: "2025-12-31",
    });
    assert.equal(resolveFinanceCalendarPeriod("month", "2026-09", now), null);
  });

  it("keeps the selected calendar period in the URL", () => {
    const params = parseFinanceParams({
      range: "custom",
      period: "quarter",
      from: "2026-04-01",
      to: "2026-06-30",
    });

    assert.equal(params.period, "quarter");
    assert.equal(
      serializeFinanceParams(params).toString(),
      "range=custom&from=2026-04-01&to=2026-06-30&period=quarter",
    );
    assert.equal(
      getFinanceCalendarPeriodSelection("quarter", {
        start: params.from ?? "",
        end: params.to ?? "",
      }),
      "2026-Q2",
    );
  });

  it("keeps a custom day range in the URL without a calendar period", () => {
    const params = parseFinanceParams({
      range: "custom",
      from: "2026-03-01",
      to: "2026-03-15",
    });

    assert.equal(params.period, null);
    assert.equal(params.from, "2026-03-01");
    assert.equal(params.to, "2026-03-15");
    assert.equal(
      serializeFinanceParams(params).toString(),
      "range=custom&from=2026-03-01&to=2026-03-15",
    );
    assert.deepEqual(
      getPresetRange("custom", now, { from: params.from, to: params.to }),
      { start: "2026-03-01", end: "2026-03-15" },
    );
    assert.deepEqual(
      getPresetRange("custom", now, {
        from: "2026-03-15",
        to: "2026-03-01",
      }),
      { start: "2026-03-01", end: "2026-03-15" },
    );
  });
});
