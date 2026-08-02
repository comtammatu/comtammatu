import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const readWeb = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "..", path), "utf8");

const readRoot = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../../..", path), "utf8");

test("VAT cockpit sums supplier and operating-expense input VAT, and issued HĐĐT output VAT", () => {
  const cockpit = readWeb("app/(protected)/finance/_lib/finance-cockpit.ts");

  assert.match(
    readRoot(
      "supabase/migrations/20260731130332_grant_supplier_invoice_cockpit_columns.sql",
    ),
    /GRANT SELECT\s+\(document_status\)\s+ON public\.supplier_invoices\s+TO authenticated/,
  );
  assert.match(
    cockpit,
    /\.in\("document_status", \["confirmed", "adjusted"\]\)/,
  );
  assert.match(cockpit, /\.from\("expenses"\)\s*\.select\("vat_amount, category"\)/);
  assert.match(
    cockpit,
    /sumVat\(\s*\(expenses\.data \?\? \[\]\)\.filter\(\(row\) =>\s*isOperatingExpenseCategory\(row\.category\)/,
  );
  assert.match(
    cockpit,
    /\.from\("tax_invoices"\)[\s\S]*?\.eq\("status", "issued"\)/,
  );
  assert.match(
    readWeb("lib/messages/finance.ts"),
    /vatUnavailable: "Không tải được dữ liệu"/,
  );
});
