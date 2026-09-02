import path from "node:path";
import test from "node:test";
import { readActiveMigrationSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const repoRoot = path.resolve(import.meta.dirname, "../../..");
const _migrationsRoot = path.join(repoRoot, "supabase", "migrations");

function readMigration(): string {
  return readActiveMigrationSql(repoRoot);
}

test("2026 menu VAT matrix keeps packaged soft drinks at 10%", () => {
  const migration = readMigration();
  assertSqlMatch(migration, /'Coca Cola'/);
  assertSqlMatch(migration, /'Sprite'/);
  assertSqlMatch(migration, /'Fanta Cam'/);
  assertSqlMatch(migration, /'Fanta Xá Xị'/);
  assertSqlMatch(migration,
    /name IN \(\s*'Coca Cola',[\s\S]*?\)\s*AND vat_rate IS DISTINCT FROM 10/,
  );
});

test("2026 menu VAT matrix moves house drinks and towel to 8%", () => {
  const migration = readMigration();
  for (const name of [
    "Nước Suối",
    "Trà Đá",
    "Cam Ép",
    "Rau Má",
    "Trà Tắc",
    "Nước Sâm",
  ]) {
    assertSqlMatch(migration, new RegExp(`'${name}'`));
  }
  assertSqlMatch(migration, /name = 'Khăn Lạnh'/);
  assertSqlMatch(migration, /name = 'Phụ thu'/);
  assertSqlMatch(migration, /vat_rate = 8/);
});

test("daily B2C aggregate uses exclusion-aware VAT line names", () => {
  const migration = readMigration();
  assertSqlMatch(migration,
    /aggregate_daily_b2c_invoice_vat_line_name\(vat_rate\)/,
  );
  assertSqlMatch(migration, /Hàng hóa loại trừ \/ NGK có đường \(10%\)/);
  assertSqlNotMatch(migration, /Đồ uống có cồn \(10%\)/);
});
