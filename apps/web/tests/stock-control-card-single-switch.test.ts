import { readSql } from "./_lib/active-sql.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) =>
  String(path).includes("supabase/migrations/")
    ? readSql(repoRoot, String(path).replace(/^.*?(supabase\/)/, "supabase/"))
    : readFileSync(resolve(repoRoot, path), "utf8");

const STOCK_CONTROL_CARD =
  "apps/web/app/(protected)/br/_shared/settings/pos/stock-control-card.tsx";
const ACTIONS =
  "apps/web/app/(protected)/br/_shared/settings/pos/actions.ts";
const PAGE =
  "apps/web/app/(protected)/br/[branchId]/(operator)/settings/pos/page.tsx";
const FEATURE_FLAGS = "apps/web/app/(protected)/inventory/_lib/feature-flags.ts";

test("StockControlCard renders exactly one Switch, wired to the single posting flag", () => {
  const source = read(STOCK_CONTROL_CARD);

  const switchCount = (source.match(/<Switch\b/g) ?? []).length;
  assert.equal(switchCount, 1, "expected exactly one <Switch> in the card");

  assert.match(source, /setBranchStockOutcomePosting/);
  assert.doesNotMatch(source, /setBranchStockAvailabilityGate/);
  assert.doesNotMatch(source, /initialGateEnabled/);
  assert.doesNotMatch(source, /stockAvailabilityGate/);

  assert.match(source, /copy\.stockOutcomePostingLabel/);
  assert.match(source, /copy\.stockOutcomePostingHelp/);
  assert.match(source, /@comtammatu\/ui\/components\/item/);
  assert.match(source, /<Item variant="outline"/);
  assert.match(source, /htmlFor=\{switchId\}/);
  assert.match(source, /id=\{switchId\}/);
  assert.doesNotMatch(source, /rounded-md border p-3/);
});

test("branch-settings pos actions: gate-flag action removed", () => {
  const source = read(ACTIONS);
  assert.doesNotMatch(source, /setBranchStockAvailabilityGate/);
  assert.doesNotMatch(source, /POS_STOCK_AVAILABILITY_GATE/);
});

test("settings/pos page: gate-flag fetch removed", () => {
  const source = read(PAGE);
  assert.doesNotMatch(source, /POS_STOCK_AVAILABILITY_GATE/);
  assert.doesNotMatch(source, /stockAvailabilityGateEnabled/);
  assert.doesNotMatch(source, /initialGateEnabled/);
});

test("feature-flags registry: gate flag key removed", () => {
  const source = read(FEATURE_FLAGS);
  assert.doesNotMatch(source, /POS_STOCK_AVAILABILITY_GATE/);
  assert.doesNotMatch(source, /pos_stock_availability_gate/);
  assert.doesNotMatch(source, /INVENTORY_STOCKTAKE_REDESIGNED/);
  assert.doesNotMatch(source, /inv_stocktake_redesigned/);
  assert.doesNotMatch(source, /S11_WASTE_TIER/);
  assert.doesNotMatch(source, /inv_s11_waste_tier/);
});
