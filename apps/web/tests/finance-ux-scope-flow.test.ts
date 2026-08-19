import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { messages } from "../lib/messages";
import {
  resolveFinanceNav,
  withFinanceNavScope,
} from "../app/(protected)/finance/components/finance-nav";
import {
  financeHref,
  mergePreservedFinanceSearch,
  parseFinanceParams,
  serializeFinanceParams,
} from "../app/(protected)/finance/_lib/finance-params";
import {
  BANK_RECONCILIATION_FILTER_DEFAULT,
  BANK_RECONCILIATION_FILTER_PARAM,
  parseBankReconciliationFilter,
} from "../app/(protected)/finance/_lib/bank-reconciliation-filter";

describe("Finance UX scope flow", () => {
  it("builds scoped finance hrefs and keeps list-local extras", () => {
    const params = parseFinanceParams({
      branch: "3",
      range: "custom",
      period: "month",
      from: "2026-07-01",
      to: "2026-07-31",
    });
    assert.equal(
      financeHref("/finance/expenses", params, { state: "pending" }),
      "/finance/expenses?branch=3&range=custom&from=2026-07-01&to=2026-07-31&period=month&state=pending",
    );
    assert.match(
      financeHref("/finance/bank-transactions", params, {
        recon: "needs_review",
      }),
      /recon=needs_review/,
    );
    assert.match(
      financeHref("/finance/invoices", params, { queue: "attention" }),
      /queue=attention/,
    );
  });

  it("preserves non-finance query keys when FilterBar rewrites period", () => {
    const financeSearch = serializeFinanceParams(
      parseFinanceParams({ branch: "3", range: "today" }),
    );
    const merged = mergePreservedFinanceSearch(
      financeSearch,
      new URLSearchParams("recon=money_in_review&state=pending"),
    );
    assert.equal(merged.get("branch"), "3");
    assert.equal(merged.get("range"), "today");
    assert.equal(merged.get("recon"), "money_in_review");
    assert.equal(merged.get("state"), "pending");
  });

  it("attaches scope via linkHref on finance deep nav without changing match href", () => {
    const groups = resolveFinanceNav({
      showInvoices: true,
      showSupplierPayables: true,
      showRevenueTargets: true,
    });
    assert.equal(messages.finance.nav.groups.reports, "Doanh thu");
    assert.deepEqual(
      groups.map((group) => group.title),
      [
        messages.finance.nav.groups.money,
        messages.finance.nav.groups.reports,
        messages.finance.nav.groups.documents,
      ],
    );
    assert.deepEqual(
      groups[0]?.items.map((item) => item.href),
      ["/finance", "/finance/bank-transactions", "/finance/expenses", "/finance/equipment"],
    );
    assert.deepEqual(
      groups[1]?.items.map((item) => item.href),
      ["/finance/revenue", "/finance/food-cost", "/finance/targets"],
    );
    const scoped = withFinanceNavScope(
      groups,
      parseFinanceParams({ branch: "9", range: "yesterday" }),
    );
    const revenue = scoped
      .flatMap((group) => group.items)
      .find((item) => item.href === "/finance/revenue");
    assert.ok(revenue);
    assert.equal(revenue.href, "/finance/revenue");
    assert.equal(
      revenue.linkHref,
      "/finance/revenue?branch=9&range=yesterday",
    );
    const targets = scoped
      .flatMap((group) => group.items)
      .find((item) => item.href === "/finance/targets");
    assert.ok(targets);
    assert.equal(targets.linkHref, undefined);
  });

  it("parses bank reconciliation filter from the URL with all default", () => {
    assert.equal(BANK_RECONCILIATION_FILTER_DEFAULT, "all");
    assert.equal(parseBankReconciliationFilter(null), "all");
    assert.equal(parseBankReconciliationFilter("matched"), "matched");
    assert.equal(parseBankReconciliationFilter("needs_review"), "needs_review");
    assert.equal(parseBankReconciliationFilter("not-a-filter"), "all");
    assert.equal(BANK_RECONCILIATION_FILTER_PARAM, "recon");
  });

  it("wires shell and cockpit to preserve finance scope in the flow", () => {
    const shell = readFileSync(
      new URL("../app/components/control-surface-shell.tsx", import.meta.url),
      "utf8",
    );
    const cockpit = readFileSync(
      new URL(
        "../app/(protected)/finance/_lib/finance-cockpit.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const filterBar = readFileSync(
      new URL(
        "../app/(protected)/finance/components/filter-bar.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const page = readFileSync(
      new URL("../app/(protected)/finance/page.tsx", import.meta.url),
      "utf8",
    );
    const bankPage = readFileSync(
      new URL(
        "../app/(protected)/finance/bank-transactions/page.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const invoicesPage = readFileSync(
      new URL(
        "../app/(protected)/finance/invoices/page.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const foodCostClient = readFileSync(
      new URL(
        "../app/(protected)/finance/food-cost/food-cost-client.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    assert.match(shell, /withFinanceNavScope/);
    assert.match(cockpit, /financeHref\("\/finance\/expenses"/);
    assert.match(cockpit, /recon: "needs_review"/);
    assert.match(filterBar, /mergePreservedFinanceSearch/);
    assert.match(page, /FinancePeriodFormulaShell/);
    assert.match(page, /basic\.sections\.assets/);
    assert.doesNotMatch(page, /FINANCE_ATTENTION_ID/);
    assert.match(page, /min-w-0 md:grid md:gap-2 xl:contents/);
    assert.doesNotMatch(bankPage, /backToFinance/);
    assert.match(invoicesPage, /basePath="\/finance\/invoices"/);
    assert.match(foodCostClient, /FinanceExportActions/);
  });

  it("adds segment loading skeletons for Finance deep routes", () => {
    const segments = [
      "revenue",
      "bank-transactions",
      "expenses",
      "equipment",
      "food-cost",
      "invoices",
      "supplier-invoices",
      "targets",
    ];
    for (const segment of segments) {
      const source = readFileSync(
        new URL(
          `../app/(protected)/finance/${segment}/loading.tsx`,
          import.meta.url,
        ),
        "utf8",
      );
      assert.match(source, /PageSkeleton/, segment);
    }
  });
});
