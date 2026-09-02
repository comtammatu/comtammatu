import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch } from "./_lib/active-sql.ts";


const root = join(process.cwd(), "../..");
const read = (rel: string) => readSql(root, rel);
const bulkMigration = read(
  "supabase/migrations/20260729160100_bulk_create_supplier_items.sql",
);

test("preferred supplier migration adds is_preferred and setter RPC", () => {
  const migration = read(
    "supabase/migrations/20260729140400_supplier_item_preferred.sql",
  );
  assertSqlMatch(migration, /ADD COLUMN IF NOT EXISTS is_preferred boolean/);
  assertSqlMatch(migration, /supplier_items_one_preferred_per_ingredient_uidx/);
  assertSqlMatch(migration, /GRANT SELECT \(is_preferred\)/);
  assertSqlMatch(migration, /set_supplier_item_preferred/);
});

test("GRN create auto-selects preferred supplier when multiple mappings", () => {
  const model = read("apps/web/lib/inventory/grn-create-model.ts");
  const actions = read(
    "apps/web/app/(protected)/inventory/suppliers/[id]/items/actions.ts",
  );
  const client = read(
    "apps/web/app/(protected)/inventory/suppliers/[id]/items/supplier-items-client.tsx",
  );

  assert.match(model, /function resolveDefaultGrnSupplier/);
  assert.match(model, /supplier\.isPreferred === true/);
  assert.match(actions, /set_supplier_item_preferred/);
  assert.match(actions, /bulk_create_supplier_items/);
  assertSqlMatch(bulkMigration, /NOT EXISTS \(/);
  assertSqlMatch(bulkMigration, /peer\.is_active/);
  assert.match(client, /setSupplierItemPreferred/);
  assert.match(client, /preferredBadge/);
});
