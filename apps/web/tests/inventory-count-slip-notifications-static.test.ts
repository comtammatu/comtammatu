import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = join(import.meta.dirname, "../../..");

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function around(source: string, needle: string) {
  const index = source.indexOf(needle);
  assert.notEqual(index, -1, `${needle} must exist`);
  return source.slice(Math.max(0, index - 900), index + 1_200);
}

test("count-slip RPCs emit durable notifications with review links", () => {
  const submitApproveSql = readRepoFile(
    "supabase/migrations/_archive/20260629130000_inventory_multiunit_stocktake_count.sql",
  );
  const recountSql = readRepoFile(
    "supabase/migrations/_archive/20260627201823_inventory_per_employee_count_slips.sql",
  );
  const messageSrc = readRepoFile("apps/web/lib/messages/notifications.ts");
  const itemSrc = readRepoFile("apps/web/app/_components/notification-item.tsx");
  const submittedBlock = around(submitApproveSql, "'inventory.count_slip_submitted'");
  const approvedBlock = around(submitApproveSql, "'inventory.count_slip_approved'");
  const recountBlock = around(recountSql, "'inventory.count_slip_recount'");

  assert.match(
    submittedBlock,
    /ARRAY\['branch_manager', 'warehouse_manager', 'owner'\]::text\[\][\s\S]*'inventory\.count_slip_submitted'[\s\S]*'\/inventory\/count-slips'[\s\S]*format\('inventory\.count_slip:%s:submitted', v_slip_id\)/,
    "submitted count slips must notify managers and link to review queue",
  );
  assert.match(
    approvedBlock,
    /'inventory\.count_slip_approved'[\s\S]*'\/employee\/count'[\s\S]*format\('inventory\.count_slip:%s:approved', p_slip_id\)/,
    "approved count slips must notify the employee count page",
  );
  assert.match(
    recountBlock,
    /'inventory\.count_slip_recount'[\s\S]*'\/employee\/count'[\s\S]*format\('inventory\.count_slip:%s:recount', p_slip_id\)/,
    "recount requests must notify the employee count page",
  );

  for (const kind of [
    "inventory.count_slip_submitted",
    "inventory.count_slip_approved",
    "inventory.count_slip_recount",
  ]) {
    assert.match(messageSrc, new RegExp(`"${kind}"`), `${kind} needs a label`);
    assert.match(itemSrc, new RegExp(`case "${kind}"`), `${kind} needs an icon`);
  }
});
