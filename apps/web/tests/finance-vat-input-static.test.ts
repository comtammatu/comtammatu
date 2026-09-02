import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch } from "./_lib/active-sql.ts";


const readWeb = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "..", path), "utf8");

const readRoot = (path: string) =>
  readSql(process.cwd(), path);

test("VAT cockpit sums supplier and operating-expense input VAT, and issued HĐĐT output VAT", () => {
  const cockpit = readWeb("app/(protected)/finance/_lib/finance-cockpit.ts");
  const page = readWeb("app/(protected)/finance/page.tsx");

  assertSqlMatch(readRoot(
      "supabase/migrations/20260731130332_grant_supplier_invoice_cockpit_columns.sql",
    ),
    /GRANT SELECT\s+\(document_status\)\s+ON public\.supplier_invoices\s+TO authenticated/,
  );
  // Operating hub no longer fans out VAT reads; grants stay for future surfaces.
  assert.match(cockpit, /vat: \{ inputRecorded: null, outputIssued: null \}/);
  assert.doesNotMatch(cockpit, /\.from\("supplier_invoices"\)/);
  assert.doesNotMatch(cockpit, /\.from\("tax_invoices"\)/);
  assert.doesNotMatch(cockpit, /\.in\("document_status", \["confirmed", "adjusted"\]\)/);
  assert.doesNotMatch(page, /cockpit\.vat\.inputRecorded/);
  assert.doesNotMatch(page, /basic\.sections\.vat/);
  assert.match(
    readWeb("lib/messages/finance.ts"),
    /vatUnavailable: "Không tải được dữ liệu"/,
  );
});
