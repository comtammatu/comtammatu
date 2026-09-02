import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);

test("company WAC migration keeps GRN unpriced and restates via events", () => {
  const sql = read(
    "supabase/migrations/20260817183130_company_wac_and_cost_restatement.sql",
  );

  assertSqlMatch(sql, /ingredient_provisional_unit_cost/);
  assertSqlMatch(sql, /project_company_wac/);
  assertSqlMatch(sql, /company_wac_equalize/);
  assertSqlMatch(sql, /provisional_reprice/);
  assertSqlMatch(sql, /repair_company_wac_valuation/);
  assertSqlMatch(sql, /missing_provisional_unit_cost/);
  assertSqlMatch(sql, /auth_is_owner/);
  assertSqlMatch(sql, /p_dry_run boolean DEFAULT true/);
  assertSqlMatch(sql, /v_kind = 'finished_good'/);
  assertSqlMatch(sql, /source_kind = 'production_output'/);
  assertSqlNotMatch(sql, /UPDATE public\.stock_movements/);
});

test("company WAC SQL proof covers pending GRN, FG skip GRN, equalize, and append-only repair", () => {
  const sql = read("supabase/tests/company_wac_restatement_test.sql");
  assertSqlMatch(sql, /pending GRN must book last-invoice provisional/);
  assertSqlMatch(sql, /project_company_wac/);
  assertSqlMatch(sql, /repair must be owner-only and append-only/);
  assertSqlMatch(sql, /production must cost consumed WAC/);
  assertSqlMatch(sql, /FG provisional must skip GRN/);
  assertSqlMatch(sql, /FG site WAC diverged after equalize/);
  assertSqlMatch(sql, /transfer receive must not overwrite site WAC/);
});

test("transfer receive must not overwrite company WAC", () => {
  const sql = read(
    "supabase/migrations/20260818012917_transfer_receive_keep_company_wac.sql",
  );
  const proof = read("supabase/tests/stock_fulfillment_workflow_test.sql");

  assertSqlMatch(sql, /CREATE OR REPLACE FUNCTION private\.execute_stock_transfer_receive/);
  assertSqlNotMatch(sql, /avg_unit_cost = v_new_wac/);
  assert.match(proof, /receive must not overwrite company WAC/);
  assert.match(proof, /receive wrote negative WAC/);
});

test("ADR 0040 treats FG site WAC spread as a bug", () => {
  const adr = read("docs/plan/adr/0040-company-wac-and-cost-restatement.md");
  const inventory = read("docs/ref/inventory.md");
  assert.match(adr, /Finished goods \*\*never GRN\*\*/);
  assert.match(adr, /second price at Branch vs Kitchen for the same FG is a bug/);
  assert.match(adr, /Finished-good provisional ignores [`]grn_receipt[`]/);
  assert.match(adr, /execute_stock_transfer_receive/);
  assert.match(inventory, /không GRN, điều chuyển không/);
  assert.match(inventory, /Nhận phiếu không trộn/);
});

test("sườn một gang restatement uses append-only provisional reprice", () => {
  const sql = read(
    "supabase/migrations/20260817201330_reprice_suon_mot_gang_zero_origins.sql",
  );
  const cockpit = read(
    "apps/web/app/(protected)/finance/_lib/finance-cockpit.ts",
  );
  const expenses = read(
    "apps/web/app/(protected)/finance/expense-actions.ts",
  );

  assertSqlMatch(sql, /private\.reprice_zero_value_origins/);
  assertSqlMatch(sql, /private\.project_company_wac/);
  assertSqlMatch(sql, /private\.ingredient_company_wac/);
  assertSqlMatch(sql, /Thịt một gang/);
  assertSqlMatch(sql, /Sườn một gang/);
  assertSqlMatch(sql, /pos_sale_shortfall/);
  assertSqlMatch(sql, /provisional_reprice/);
  assertSqlNotMatch(sql, /UPDATE public\.stock_movements/);
  const foodCostMigration = read(
    "supabase/migrations/20260820151656_finance_food_cost_recorded.sql",
  );
  assertSqlMatch(foodCostMigration, /'provisional_reprice'/);
  assertSqlMatch(foodCostMigration,
    /event\.event_type NOT IN[\s\S]*'provisional_reprice'/,
  );
  assert.match(cockpit, /get_finance_operating_cockpit/);
  assert.match(expenses, /get_finance_food_cost_recorded/);
});
