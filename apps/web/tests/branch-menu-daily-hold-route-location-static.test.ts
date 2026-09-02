import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { readActiveMigrationSql, readSql, assertSqlMatch } from "./_lib/active-sql.ts";


const repoRoot = resolve(
  process.cwd(),
  existsSync(resolve(process.cwd(), "supabase/migrations")) ? "." : "../..",
);
const _read = (path: string) => readSql(repoRoot, path);

function holdFixMigration(): string {
  return readActiveMigrationSql(repoRoot);
}

test("orders and branch_menu_item_daily_holds use dedicated, type-safe trigger functions", () => {
  const sql = holdFixMigration();

  // Check order routing function definition and behavior
  assertSqlMatch(sql,
    /CREATE OR REPLACE FUNCTION private\.route_order_stock_consumption_location\(\)/,
  );
  assertSqlMatch(sql, /order_stock_consumption_location_immutable/);
  assertSqlMatch(sql, /NEW\.split_from_order_id/);
  assertSqlMatch(sql, /comtammatu\.daily_limit_hold_token/);

  // Check hold routing function definition and behavior (must NOT reference split_from_order_id)
  assertSqlMatch(sql,
    /CREATE OR REPLACE FUNCTION private\.route_hold_stock_consumption_location\(\)/,
  );
  assertSqlMatch(sql, /hold_stock_consumption_location_immutable/);

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
  assertSqlMatch(sql,
    /CREATE TRIGGER orders_route_stock_consumption_location[\s\S]*?EXECUTE FUNCTION private\.route_order_stock_consumption_location\(\)/,
  );
  assertSqlMatch(sql,
    /CREATE TRIGGER branch_menu_holds_route_stock_consumption_location[\s\S]*?EXECUTE FUNCTION private\.route_hold_stock_consumption_location\(\)/,
  );

  // Check drop of deprecated shared function
  assertSqlMatch(sql,
    /DROP FUNCTION IF EXISTS private\.route_stock_consumption_location\(\)/,
  );
});
