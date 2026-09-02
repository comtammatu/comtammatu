import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readSql } from "../../test-utils/active-sql";

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) =>
  String(path).includes("supabase/migrations/")
    ? readSql(repoRoot, String(path).replace(/^.*?(supabase\/)/, "supabase/"))
    : readFileSync(resolve(repoRoot, path), "utf8");

test("manual-issue dialog reuses createTaxInvoice — no second money path", () => {
  const dialog = read(
    "apps/web/app/(protected)/finance/manual-issue-invoice-dialog.tsx",
  );

  assert.ok(
    dialog.includes("createTaxInvoice") &&
      dialog.includes("resolveOrderForManualInvoice"),
    "dialog must resolve then issue through the existing createTaxInvoice action",
  );
  assert.ok(
    !/status:\s*"issued"/.test(dialog) &&
      !dialog.includes('from("tax_invoices")'),
    "dialog must not write invoice rows itself — issuance stays server-side in createTaxInvoice",
  );
});

test("resolveOrderForManualInvoice is branch-scoped and read-only", () => {
  const actions = read("apps/web/app/(protected)/finance/actions.ts");

  assert.ok(
    actions.includes("export async function resolveOrderForManualInvoice"),
    "manual-issue resolver must exist",
  );
  // order_number is unique only per (branch_id, order_number, tenant_id): the
  // lookup MUST anchor on branch_id + tenant_id, else it can match the wrong
  // branch's order and issue an HĐĐT against a stranger's bill.
  assert.ok(
    /resolveOrderForManualInvoice[\s\S]*?\.eq\("tenant_id"[\s\S]*?\.eq\("branch_id"[\s\S]*?\.eq\("order_number"[\s\S]*?\.maybeSingle\(\)/.test(
      actions,
    ),
    "resolver must query orders by (tenant_id, branch_id, order_number).maybeSingle()",
  );
  assert.ok(
    /resolveOrderForManualInvoice[\s\S]*?canAccessBranch\(/.test(actions),
    "resolver must apply branch-scope read control before returning order details",
  );
});

test("manual-issue gates on the issuance predicate, not canManageInvoices", () => {
  const actions = read("apps/web/app/(protected)/finance/actions.ts");
  const page = read("apps/web/app/(protected)/finance/invoices/page.tsx");

  assert.ok(
    /export async function createTaxInvoice[\s\S]*?getAuthContextWithPermission\(\s*FINANCE_ROLES,\s*PERMISSION_KEYS\.FINANCE_VIEW/.test(
      actions,
    ) &&
      /export async function canIssueManualInvoice[\s\S]*?getAuthContextWithPermission\(\s*FINANCE_ROLES,\s*PERMISSION_KEYS\.FINANCE_VIEW/.test(
        actions,
      ),
    "canIssueManualInvoice must enforce the SAME predicate as createTaxInvoice",
  );
  assert.ok(
    page.includes("canIssueManualInvoice()") &&
      page.includes("canIssueInvoices={canIssueInvoices}"),
    "invoices page must gate the button on canIssueManualInvoice, not canManageInvoices",
  );
});
