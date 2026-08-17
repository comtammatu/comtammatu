import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("company WAC migration keeps GRN unpriced and restates via events", () => {
  const sql = read(
    "supabase/migrations/20260817183130_company_wac_and_cost_restatement.sql",
  );

  assert.match(sql, /ingredient_provisional_unit_cost/);
  assert.match(sql, /project_company_wac/);
  assert.match(sql, /company_wac_equalize/);
  assert.match(sql, /provisional_reprice/);
  assert.match(sql, /repair_company_wac_valuation/);
  assert.match(sql, /missing_provisional_unit_cost/);
  assert.match(sql, /auth_is_owner/);
  assert.match(sql, /p_dry_run boolean DEFAULT true/);
  assert.match(sql, /v_kind = 'finished_good'/);
  assert.match(sql, /source_kind = 'production_output'/);
  assert.doesNotMatch(sql, /UPDATE public\.stock_movements/);
});

test("company WAC SQL proof covers pending GRN, FG skip GRN, equalize, and append-only repair", () => {
  const sql = read("supabase/tests/company_wac_restatement_test.sql");
  assert.match(sql, /pending GRN must book last-invoice provisional/);
  assert.match(sql, /project_company_wac/);
  assert.match(sql, /repair must be owner-only and append-only/);
  assert.match(sql, /production must cost consumed WAC/);
  assert.match(sql, /FG provisional must skip GRN/);
  assert.match(sql, /FG site WAC diverged after equalize/);
});

test("ADR 0040 treats FG site WAC spread as a bug", () => {
  const adr = read("docs/plan/adr/0040-company-wac-and-cost-restatement.md");
  const inventory = read("docs/ref/inventory.md");
  assert.match(adr, /Finished goods \*\*never GRN\*\*/);
  assert.match(adr, /second price at Branch vs Kitchen for the same FG is a bug/);
  assert.match(adr, /Finished-good provisional ignores [`]grn_receipt[`]/);
  assert.match(inventory, /không GRN, điều chuyển không/);
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

  assert.match(sql, /private\.reprice_zero_value_origins/);
  assert.match(sql, /private\.project_company_wac/);
  assert.match(sql, /private\.ingredient_company_wac/);
  assert.match(sql, /Thịt một gang/);
  assert.match(sql, /Sườn một gang/);
  assert.match(sql, /pos_sale_shortfall/);
  assert.match(sql, /provisional_reprice/);
  assert.doesNotMatch(sql, /UPDATE public\.stock_movements/);
  assert.match(cockpit, /eventType === "provisional_reprice"/);
  assert.match(expenses, /"provisional_reprice"/);
});
