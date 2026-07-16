import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

const migration = read(
  "supabase/migrations/20260716170000_restore_momo_finance_reporting_contract.sql",
);
const databaseTypes = read("packages/database/src/types/database.types.ts");
const revenueClient = read(
  "apps/web/app/(protected)/finance/revenue/revenue-client.tsx",
);
const financeMessages = read("apps/web/lib/messages/finance.ts");
const operatingContract = read("docs/ref/operational-data-contract.md");

test("MoMo remains a first-class Finance reporting method", () => {
  for (const functionName of [
    "get_daily_revenue",
    "get_revenue_kpis",
    "get_revenue_rollup",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `DROP FUNCTION IF EXISTS public\\.${functionName}\\([\\s\\S]*?CREATE OR REPLACE FUNCTION public\\.${functionName}\\([\\s\\S]*?momo_revenue NUMERIC`,
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${functionName}\\([\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role;[\\s\\S]*?GRANT EXECUTE ON FUNCTION public\\.${functionName}`,
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${functionName}\\([\\s\\S]*?SECURITY DEFINER[\\s\\S]*?SET search_path TO ''`,
      ),
    );
  }

  assert.match(
    migration,
    /CREATE MATERIALIZED VIEW public\.mv_daily_revenue[\s\S]*payment_method = 'momo'[\s\S]*pd\.momo_revenue/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.get_revenue_by_cashier[\s\S]*sp\.method IN \('vietqr', 'momo'\)/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.get_revenue_by_cashier[\s\S]*SECURITY DEFINER[\s\S]*SET search_path TO ''/,
  );
  assert.doesNotMatch(
    migration,
    /payments_by_cashier[\s\S]*sp\.method = 'vietqr'[\s\S]*qr_revenue/,
  );
  assert.equal(databaseTypes.match(/momo_revenue:/g)?.length, 4);
  assert.match(revenueClient, /kpis\?\.momo_revenue/);
  assert.match(financeMessages, /colQrMomo: "QR\/MoMo"/);
  assert.match(
    operatingContract,
    /\| `Tiền mặt`, `VietQR`, `MoMo`[\s\S]*payments\.amount/,
  );
});
