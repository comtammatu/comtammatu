import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  FINANCE_LOCATIONS,
  FINANCE_OVERVIEW_PERIODS,
  getFinanceCalendarPeriodSelection,
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
      "location=company",
    );
    assert.equal(
      serializeFinanceParams(
        parseFinanceParams({ location: "branches" }),
      ).toString(),
      "location=branches",
    );
    assert.equal(
      serializeFinanceParams(parseFinanceParams({ branch: "12" })).toString(),
      "branch=12",
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
    assert.match(page, /locationFilter/);
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
    assert.match(cockpit, /query = query\.is\("branch_id", null\)/);
    assert.match(cockpit, /query = query\.not\("branch_id", "is", null\)/);
    assert.match(
      cockpit,
      /supplierInvoiceQuery = supplierInvoiceQuery\.is\("grn_id", null\)/,
    );
  });

  it("offers the six approved period choices on the overview", () => {
    assert.deepEqual(FINANCE_OVERVIEW_PERIODS, [
      "today",
      "yesterday",
      "week",
      "month",
      "quarter",
      "year",
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
    assert.match(filterBar, /<BusinessDatePicker/);
    assert.doesNotMatch(filterBar, /type="(?:date|month|week)"/);
    assert.match(
      readFileSync(
        new URL(
          "../app/components/form/business-date-field.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      /<Calendar[\s\S]*?locale=\{vi\}/,
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
});
