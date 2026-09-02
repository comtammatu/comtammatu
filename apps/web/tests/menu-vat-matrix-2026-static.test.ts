import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const migrationsRoot = path.join(repoRoot, "supabase", "migration-archive");

function readMigration(): string {
  const filename = readdirSync(migrationsRoot).find((candidate) =>
    candidate.endsWith("_menu_vat_rate_matrix_2026.sql"),
  );
  assert.ok(filename, "menu_vat_rate_matrix_2026 migration must exist");
  return readFileSync(path.join(migrationsRoot, filename), "utf8");
}

test("2026 menu VAT matrix keeps packaged soft drinks at 10%", () => {
  const migration = readMigration();
  assert.match(migration, /'Coca Cola'/);
  assert.match(migration, /'Sprite'/);
  assert.match(migration, /'Fanta Cam'/);
  assert.match(migration, /'Fanta Xá Xị'/);
  assert.match(
    migration,
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
    assert.match(migration, new RegExp(`'${name}'`));
  }
  assert.match(migration, /name = 'Khăn Lạnh'/);
  assert.match(migration, /name = 'Phụ thu'/);
  assert.match(migration, /vat_rate = 8/);
});

test("daily B2C aggregate uses exclusion-aware VAT line names", () => {
  const migration = readMigration();
  assert.match(
    migration,
    /aggregate_daily_b2c_invoice_vat_line_name\(vat_rate\)/,
  );
  assert.match(migration, /Hàng hóa loại trừ \/ NGK có đường \(10%\)/);
  assert.doesNotMatch(migration, /Đồ uống có cồn \(10%\)/);
});
