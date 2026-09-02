import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("get_inventory_value_period includes branch kitchen locations in fallback valuation", () => {
  const migrationsDir = "../../supabase/migrations";
  const migrationFiles = readdirSync(migrationsDir).filter((file) =>
    file.endsWith(".sql"),
  );
  const targetFile = migrationFiles.find((file) =>
    file.includes("include_branch_kitchen_in_inventory_value_period"),
  );

  assert.ok(
    targetFile,
    "Migration include_branch_kitchen_in_inventory_value_period must exist",
  );

  const migrationSql = read(join(migrationsDir, targetFile));

  // Must define or replace get_inventory_value_period
  assert.match(migrationSql, /FUNCTION public\.get_inventory_value_period/);

  // Must include branch kitchen in addition to warehouse
  assert.match(
    migrationSql,
    /branch\.branch_kind\s*=\s*'branch'\s*AND\s*location\.location_kind\s*=\s*'kitchen'/,
  );

  // Must maintain warehouse and central_kitchen production_storage
  assert.match(migrationSql, /location\.location_kind\s*=\s*'warehouse'/);
  assert.match(
    migrationSql,
    /branch\.branch_kind\s*=\s*'central_kitchen'\s*AND\s*location\.location_kind\s*=\s*'production_storage'/,
  );

  // Must maintain security definer search_path safety and permissions
  assert.match(migrationSql, /SECURITY DEFINER\s*SET search_path TO ''/);
  assert.match(
    migrationSql,
    /GRANT ALL ON FUNCTION public\.get_inventory_value_period\(date, date, bigint\) TO authenticated;/,
  );
});
