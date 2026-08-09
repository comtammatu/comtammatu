import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(process.cwd(), "../..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const bulkMigration = read(
  "supabase/migration-archive/20260729160100_bulk_create_supplier_items.sql",
);

test("preferred supplier migration adds is_preferred and setter RPC", () => {
  const migration = read(
    "supabase/migration-archive/20260729140400_supplier_item_preferred.sql",
  );
  assert.match(migration, /ADD COLUMN IF NOT EXISTS is_preferred boolean/);
  assert.match(migration, /supplier_items_one_preferred_per_ingredient_uidx/);
  assert.match(migration, /GRANT SELECT \(is_preferred\)/);
  assert.match(migration, /set_supplier_item_preferred/);
});

test("GRN create auto-selects preferred supplier when multiple mappings", () => {
  const model = read("apps/web/lib/inventory/grn-create-model.ts");
  const editor = read(
    "apps/web/app/(protected)/inventory/_components/grn-line-editor.tsx",
  );
  const actions = read(
    "apps/web/app/(protected)/inventory/suppliers/[id]/items/actions.ts",
  );
  const client = read(
    "apps/web/app/(protected)/inventory/suppliers/[id]/items/supplier-items-client.tsx",
  );

  assert.match(model, /function resolveDefaultGrnSupplier/);
  assert.match(model, /supplier\.isPreferred === true/);
  assert.match(editor, /resolveDefaultGrnSupplier/);
  assert.match(editor, /supplier\.isPreferred/);
  assert.match(actions, /set_supplier_item_preferred/);
  assert.match(actions, /bulk_create_supplier_items/);
  assert.match(bulkMigration, /NOT EXISTS \(/);
  assert.match(bulkMigration, /peer\.is_active/);
  assert.match(client, /setSupplierItemPreferred/);
  assert.match(client, /preferredBadge/);
});
