import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd().replaceAll("\\", "/").includes("apps/web")
  ? join(process.cwd(), "../..")
  : process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const migration = read(
  "supabase/migrations/20260822152000_fix_inventory_valuation_events_transfer_receive_event_type.sql",
);

test("migration allows transfer_receive and refund_restore in inventory_valuation_events_event_type_check", () => {
  assert.match(migration, /'transfer_receive'::text/);
  assert.match(migration, /'transfer_in'::text/);
  assert.match(migration, /'refund_restore'::text/);
  assert.match(migration, /'issue_restore'::text/);
});
