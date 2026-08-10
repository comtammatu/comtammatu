import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

/**
 * Wave 4/5 — Finance LIST + HR LIST density adoption.
 *
 * Finance LIST surfaces converge on management-list (xwide/compact +
 * AppListFrame + AppToolbar inline). Finance dashboard/targets keep Gate
 * width exceptions. HR Owner LIST pages add density=compact; dead branch
 * CheckoutsTab embed burns; Owner attendance keeps intentional embed.
 */

const repoRoot = resolve(process.cwd(), "../..");

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function readRepo(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

test("Wave 4 Finance LIST pages use xwide+compact AppPage shells", () => {
  const shells = [
    "app/(protected)/finance/expenses/page.tsx",
    "app/(protected)/finance/bank-transactions/page.tsx",
    "app/(protected)/finance/invoices/page.tsx",
    "app/(protected)/finance/supplier-invoices/page.tsx",
  ];

  for (const path of shells) {
    const source = readWeb(path);
    assert.match(
      source,
      /<AppPage width="xwide" density="compact"/,
      `${path}: AppPage xwide+compact`,
    );
  }

  const supplierClient = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );
  const supplierListUi = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoice-list-ui.tsx",
  );
  const supplierSurface = `${supplierClient}\n${supplierListUi}`;
  assert.match(
    supplierClient,
    /<AppPage width="xwide" density="compact"/,
  );
  assert.match(supplierSurface, /<AppListFrame[\s\S]{0,240}toolbar=\{/);
  assert.match(
    supplierSurface,
    /<(?:AppToolbar|FilterBar)[\s\S]{0,160}variant="inline"/,
  );
});

test("Wave 4 Finance LIST bodies use AppListFrame + inline toolbar", () => {
  const expenses = readWeb(
    "app/(protected)/finance/expenses/expenses-client.tsx",
  );
  assert.match(expenses, /<AppListFrame[\s\S]{0,240}toolbar=\{/);
  // Finance domain FilterBar adapts AppToolbar variant="inline".
  assert.match(expenses, /<FilterBar[\s\S]{0,160}variant="inline"/);
  assert.match(expenses, /<DataTable/);
  assert.doesNotMatch(expenses, /<AppSection[\s\S]*title=\{copy\.listTitle\}/);

  const bank = readWeb(
    "app/(protected)/finance/bank-transactions/bank-transactions-table.tsx",
  );
  assert.match(bank, /<AppListFrame[\s\S]{0,200}toolbar=\{/);
  assert.match(bank, /variant="inline"/);
  assert.match(bank, /<DataTable/);
  assert.doesNotMatch(bank, /<AppSection/);

  const invoices = readWeb("app/(protected)/finance/invoices/page.tsx");
  assert.match(invoices, /<AppListFrame[\s\S]{0,200}toolbar=\{/);
  assert.match(invoices, /variant="inline"/);
});

test("Wave 4 keeps Finance dashboard/targets Gate width exceptions", () => {
  const dashboard = readWeb("app/(protected)/finance/page.tsx");
  assert.match(dashboard, /<AppPage width="wide" density="compact"/);

  const targets = readWeb("app/(protected)/finance/targets/page.tsx");
  assert.match(targets, /<AppPage width="wide" density="compact"/);
  assert.match(
    readWeb("app/(protected)/finance/targets/targets-client.tsx"),
    /<AppListFrame[\s\S]{0,80}toolbar=\{/,
  );
});

test("Wave 5 HR LIST pages use xwide+compact density", () => {
  const surfaces = [
    "app/(protected)/hr/hr-client.tsx",
    "app/(protected)/hr/attendance/page.tsx",
    "app/(protected)/hr/payroll/page.tsx",
    "app/(protected)/hr/setup/page.tsx",
    "app/(protected)/hr/staff/audit/page.tsx",
  ];

  for (const path of surfaces) {
    const source = readWeb(path);
    assert.match(
      source,
      /<AppPage width="xwide" density="compact"/,
      `${path}: AppPage xwide+compact`,
    );
  }

  const auditClient = readWeb(
    "app/(protected)/hr/staff/audit/permission-audit-client.tsx",
  );
  assert.match(auditClient, /<AppListFrame[\s\S]{0,240}toolbar=\{/);
  assert.match(
    readWeb("app/(protected)/hr/staff/audit/permission-audit-filters.tsx"),
    /variant="inline"/,
  );

  const payroll = readWeb(
    "app/(protected)/hr/payroll/payroll-list-client.tsx",
  );
  assert.match(payroll, /<AppListFrame[\s\S]*?toolbar=\{/);
  assert.match(payroll, /<AppToolbar[\s\S]{0,160}variant="inline"/);
});

test("Wave 5 burns dead CheckoutsTab embed; keeps Owner attendance embed", () => {
  assert.equal(
    existsSync(
      resolve(
        repoRoot,
        "apps/web/app/(protected)/br/[branchId]/(operator)/team/_tabs/checkouts-tab.tsx",
      ),
    ),
    false,
    "dead CheckoutsTab removed",
  );

  const attendance = readWeb("app/(protected)/hr/attendance/page.tsx");
  assert.match(attendance, /StaffCheckoutApprovalsPageContent/);
  assert.match(attendance, /\bembedded\b/);

  const branchCheckout = readRepo(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/checkout-approvals/page.tsx",
  );
  assert.match(branchCheckout, /StaffCheckoutApprovalsPageContent/);
  assert.doesNotMatch(branchCheckout, /\bembedded\b/);
});
