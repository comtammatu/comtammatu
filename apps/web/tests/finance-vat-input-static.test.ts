import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const readWeb = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "..", path), "utf8");

const readRoot = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../../..", path), "utf8");

test("VAT input cockpit grants its supplier status filter and distinguishes a load failure", () => {
  assert.match(
    readRoot(
      "supabase/migrations/20260731130332_grant_supplier_invoice_cockpit_columns.sql",
    ),
    /GRANT SELECT\s+\(document_status\)\s+ON public\.supplier_invoices\s+TO authenticated/,
  );
  assert.match(
    readWeb("app/(protected)/finance/_lib/finance-cockpit.ts"),
    /\.in\("document_status", \["confirmed", "adjusted"\]\)/,
  );
  assert.match(
    readWeb("lib/messages/finance.ts"),
    /vatUnavailable: "Không tải được dữ liệu"/,
  );
});
