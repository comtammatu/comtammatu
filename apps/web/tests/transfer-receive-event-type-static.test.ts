import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { readSql } from "./_lib/active-sql.ts";


const root = process.cwd().replaceAll("\\", "/").includes("apps/web")
  ? join(process.cwd(), "../..")
  : process.cwd();
const read = (path: string) => readSql(root, path);

const archiveMigration = read(
  "supabase/migrations/20260822152000_fix_inventory_valuation_events_transfer_receive_event_type.sql",
);

const forwardMigration = read(
  "supabase/migrations/20260903021500_fix_goods_in_transfer_receive_event_type.sql",
);

test("migration allows transfer_receive and refund_restore in inventory_valuation_events_event_type_check", () => {
  assert.match(archiveMigration, /'transfer_receive'::text/);
  assert.match(archiveMigration, /'transfer_in'::text/);
  assert.match(archiveMigration, /'refund_restore'::text/);
  assert.match(archiveMigration, /'issue_restore'::text/);
});

test("goods_in calculation includes transfer_receive for branch incoming goods in cockpit and day report", () => {
  assert.match(
    forwardMigration,
    /event\.event_type IN \('transfer_in', 'transfer_receive'\)/,
  );
  assert.match(
    forwardMigration,
    /CREATE OR REPLACE FUNCTION private\.get_finance_operating_cockpit_without_inventory_breakdown/,
  );
  assert.match(
    forwardMigration,
    /CREATE OR REPLACE FUNCTION public\.get_branch_day_report/,
  );
});
