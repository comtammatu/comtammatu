import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { MBBANK_STATEMENT_PRE_SEPAY_ROWS } from "../app/(protected)/finance/bank-transactions/mbbank-statement-pre-sepay";
import {
  MBBANK_STATEMENT_ACCOUNT,
  MBBANK_STATEMENT_OPENING_BANK_DELTA,
  MBBANK_STATEMENT_OPENING_EFFECTIVE_AT,
  MBBANK_STATEMENT_RESTORE_IDEMPOTENCY_KEY,
  MBBANK_STATEMENT_ROW_COUNT,
} from "../app/(protected)/finance/bank-transactions/mbbank-statement-restore-contract";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");
const migration = read(
  "supabase/migrations/20260817204635_restore_bank_ledger_from_mbbank_statement.sql",
);
const openingMigration = read(
  "supabase/migrations/20260817211739_finance_funds_repoint_opening_effective_at.sql",
);
const webhookCutoff = Date.parse("2026-08-08T07:50:00.000Z");

test("MB statement restore keeps one bank movement and attaches SePay later", () => {
  assert.match(
    migration,
    /mbbank_statement/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX bank_transactions_tenant_reference_fact_uidx/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION private\.upsert_canonical_bank_transaction/,
  );
  assert.match(
    migration,
    /date_trunc\('minute', v_existing\.occurred_at\)/,
  );
  assert.match(
    migration,
    /v_existing\.ingest_source = 'mbbank_statement'/,
  );
  assert.match(
    migration,
    /PERFORM private\.upsert_canonical_bank_transaction/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.restore_mbbank_statement_gap/,
  );
  assert.match(migration, /auth_is_owner\(v_actor\)/);
  assert.match(
    migration,
    /public\.create_finance_fund_adjustment\(\s*0,\s*p_bank_opening_delta/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.restore_mbbank_statement_gap/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION private\.upsert_canonical_bank_transaction/,
  );

  const sqlTest = read("supabase/tests/mbbank_statement_bank_ledger_test.sql");
  assert.match(sqlTest, /restore_mbbank_statement_gap/);
  assert.match(sqlTest, /bank_transaction_conflict/);
  assert.match(sqlTest, /v_bank\.ingest_source <> 'sepay_webhook'/);

  const action = read(
    "apps/web/app/(protected)/finance/bank-transactions/restore-actions.ts",
  );
  const page = read(
    "apps/web/app/(protected)/finance/bank-transactions/page.tsx",
  );
  const dialog = read(
    "apps/web/app/(protected)/finance/bank-transactions/mbbank-statement-restore-dialog.tsx",
  );
  const model = read(
    "apps/web/app/(protected)/finance/_lib/sepay-bank-transaction-model.ts",
  );
  const financeDoc = read("docs/modules/finance.md");
  const copy = read("apps/web/lib/messages/finance.ts");

  assert.match(action, /\.rpc\(\s*"restore_mbbank_statement_gap"/);
  assert.match(action, /getAuthContextWithPermission\(\s*\["owner"\]/);
  assert.match(
    action,
    /MBBANK_STATEMENT_RESTORE_IDEMPOTENCY_KEY/,
  );
  assert.match(
    openingMigration,
    /CREATE OR REPLACE FUNCTION public\.repoint_finance_fund_opening/,
  );
  assert.match(openingMigration, /app\.finance_opening_repoint/);
  assert.match(
    openingMigration,
    /IF p_bank_opening_delta <> 0 THEN/,
  );
  assert.match(openingMigration, /p_opening_effective_at timestamp with time zone/);
  assert.match(
    action,
    /p_opening_effective_at: MBBANK_STATEMENT_OPENING_EFFECTIVE_AT/,
  );
  assert.match(page, /isOwner \? <MbbankStatementRestoreDialog \/>/);
  assert.match(dialog, /<ResponsiveActionButton[\s\S]*density="header"/);
  assert.match(dialog, /formatVNDate\(MBBANK_STATEMENT_OPENING_EFFECTIVE_AT\)/);
  assert.match(model, /"mbbank_statement"/);
  assert.match(financeDoc, /Owner MB statement backfill/);
  assert.match(financeDoc, /repoint_finance_fund_opening/);
  assert.match(copy, /statementRestoreAction: "Nhập sao kê trước SePay"/);
  assert.match(
    copy,
    /Đưa mốc mở sổ về 0 giờ 13\/07\/2026/,
  );
});

test("pre-SePay MB fixture is the 96 missing statement facts", () => {
  assert.equal(MBBANK_STATEMENT_PRE_SEPAY_ROWS.length, MBBANK_STATEMENT_ROW_COUNT);
  assert.equal(MBBANK_STATEMENT_ROW_COUNT, 96);
  assert.equal(MBBANK_STATEMENT_OPENING_BANK_DELTA, 0);
  assert.equal(
    MBBANK_STATEMENT_OPENING_EFFECTIVE_AT,
    "2026-07-13T00:00:00.000+07:00",
  );
  assert.match(MBBANK_STATEMENT_RESTORE_IDEMPOTENCY_KEY, /^[0-9a-f-]{36}$/);

  const ids = new Set(
    MBBANK_STATEMENT_PRE_SEPAY_ROWS.map((row) => row.provider_transaction_id),
  );
  assert.equal(ids.size, MBBANK_STATEMENT_PRE_SEPAY_ROWS.length);

  let incoming = 0;
  let outgoing = 0;
  for (const row of MBBANK_STATEMENT_PRE_SEPAY_ROWS) {
    assert.equal(row.provider_transaction_id.startsWith("mbbank:"), true);
    assert.equal(row.account_number, MBBANK_STATEMENT_ACCOUNT);
    assert.equal(row.raw_payload.source, "mbbank_statement");
    assert.equal(row.occurred_at.endsWith("+07:00"), true);
    assert.equal(Date.parse(row.occurred_at) < webhookCutoff, true);
    if (row.transfer_type === "in") incoming += row.amount;
    else outgoing += row.amount;
  }

  assert.equal(incoming, 3_957_718_759);
  assert.equal(outgoing, 3_862_970_097);
});
