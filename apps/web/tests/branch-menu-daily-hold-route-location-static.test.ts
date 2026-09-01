import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(
  process.cwd(),
  existsSync(resolve(process.cwd(), "supabase/migrations")) ? "." : "../..",
);
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

function holdFixMigration(): string {
  const migration = readdirSync(resolve(repoRoot, "supabase/migrations")).find(
    (name) => name.endsWith("_fix_daily_hold_consumption_location_trigger.sql"),
  );
  assert.ok(
    migration,
    "fix daily hold consumption location trigger migration is missing",
  );
  return read(`supabase/migrations/${migration}`);
}

test("orders and branch_menu_item_daily_holds use dedicated, type-safe trigger functions", () => {
  const sql = holdFixMigration();

  // Check order routing function definition and behavior
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION private\.route_order_stock_consumption_location\(\)/,
  );
  assert.match(sql, /order_stock_consumption_location_immutable/);
  assert.match(sql, /NEW\.split_from_order_id/);
  assert.match(sql, /comtammatu\.daily_limit_hold_token/);

  // Check hold routing function definition and behavior (must NOT reference split_from_order_id)
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION private\.route_hold_stock_consumption_location\(\)/,
  );
  assert.match(sql, /hold_stock_consumption_location_immutable/);

  // Extract hold function body and assert no split_from_order_id reference exists
  const holdFunctionBodyMatch = sql.match(
    /CREATE OR REPLACE FUNCTION private\.route_hold_stock_consumption_location\(\)[\s\S]*?\$\$;/,
  );
  assert.ok(holdFunctionBodyMatch, "route_hold_stock_consumption_location body not found");
  assert.doesNotMatch(
    holdFunctionBodyMatch[0],
    /split_from_order_id/,
    "route_hold_stock_consumption_location must not reference split_from_order_id",
  );

  // Check triggers binding to separate functions
  assert.match(
    sql,
    /CREATE TRIGGER orders_route_stock_consumption_location[\s\S]*?EXECUTE FUNCTION private\.route_order_stock_consumption_location\(\)/,
  );
  assert.match(
    sql,
    /CREATE TRIGGER branch_menu_holds_route_stock_consumption_location[\s\S]*?EXECUTE FUNCTION private\.route_hold_stock_consumption_location\(\)/,
  );

  // Check drop of deprecated shared function
  assert.match(
    sql,
    /DROP FUNCTION IF EXISTS private\.route_stock_consumption_location\(\)/,
  );
});
