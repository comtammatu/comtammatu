import { resolve } from "node:path";
import { test } from "node:test";

import { assertSqlMatch, assertSqlNotMatch, readSql } from "./_lib/active-sql.ts";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);

const ACTIONS = "apps/web/app/(protected)/finance/actions.ts";
const LIST = "apps/web/app/(protected)/finance/invoice-list.tsx";

test("invoice list exposes persisted replacement evidence", () => {
  const actions = read(ACTIONS);
  const list = read(LIST);

  assertSqlMatch(
    actions,
    /replacement_reason:invoice_snapshot->replacement->>reason/,
    "the list query must project the persisted reason without returning the full invoice snapshot",
  );
  assertSqlMatch(
    actions,
    /replacement_original_invoice_number:invoice_snapshot->replacement->>originalInvoiceNumber/,
    "the list query must project the human original-invoice reference",
  );
  assertSqlMatch(
    list,
    /replacement_reason[\s\S]*Lý do thay thế/,
    "Owner and Accountant must be able to read the recorded reason",
  );
});

test("queueing a replacement does not falsely mark the original as replaced", () => {
  const list = read(LIST);

  assertSqlNotMatch(
    list,
    /inv\.id === oldId \? \{ \.\.\.inv, status: "replaced" \}/,
    "the original stays issued until Viettel accepts the replacement",
  );
  assertSqlMatch(
    list,
    /fetchTaxInvoicesPage\(\{ branchId, queue \}\)/,
    "success must reload the durable queue state instead of inventing a client-only status",
  );
});
