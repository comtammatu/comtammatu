import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { normalizePgDumpSql } from "./sql-test-utils";

const repoRoot = join(import.meta.dirname, "../../..");

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function around(source: string, needle: string) {
  const index = source.indexOf(needle);
  assert.notEqual(index, -1, `${needle} must exist`);
  return source.slice(Math.max(0, index - 900), index + 1_200);
}

function functionBlock(source: string, name: string) {
  const start = source.search(
    new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\b`),
  );
  assert.notEqual(start, -1, `${name} must exist`);
  const end = source.indexOf(`COMMENT ON FUNCTION public.${name}`, start);
  return source.slice(start, end === -1 ? source.length : end);
}

test("count-slip RPCs emit durable notifications with review links", () => {
  const baselineSql = normalizePgDumpSql(
    readRepoFile("supabase/migrations/20260720035548_baseline.sql"),
  );
  const repairSql = readRepoFile(
    "supabase/migration-archive/20260716182000_restore_missed_runtime_contracts.sql",
  );
  const messageSrc = readRepoFile("apps/web/lib/messages/notifications.ts");
  const itemSrc = readRepoFile(
    "apps/web/app/_components/notification-item.tsx",
  );
  const submittedBlock = functionBlock(
    baselineSql,
    "submit_inventory_count_slip",
  );
  const approvedBlock = around(repairSql, "'inventory.count_slip_approved'");
  const recountBlock = around(repairSql, "'inventory.count_slip_recount'");

  assert.match(
    submittedBlock,
    /ARRAY\['branch_manager', 'owner', 'owner'\]::text\[\][\s\S]*'inventory\.count_slip_submitted'[\s\S]*format\('\/br\/%s\/stock\/count-slips', p_branch_id\)[\s\S]*format\('inventory\.count_slip:%s:submitted', v_slip_id\)/,
    "submitted count slips must notify managers and link to review queue",
  );
  assert.match(
    approvedBlock,
    /'inventory\.count_slip_approved'[\s\S]*format\('\/br\/%s\/stock\/count', v_slip\.branch_id\)[\s\S]*format\('inventory\.count_slip:%s:approved', p_slip_id\)/,
    "approved count slips must notify the Branch home count page",
  );
  assert.match(
    recountBlock,
    /'inventory\.count_slip_recount'[\s\S]*format\('\/br\/%s\/stock\/count', v_slip\.branch_id\)[\s\S]*format\('inventory\.count_slip:%s:recount', p_slip_id\)/,
    "recount requests must notify the Branch home count page",
  );

  for (const kind of [
    "inventory.count_slip_submitted",
    "inventory.count_slip_approved",
    "inventory.count_slip_recount",
  ]) {
    assert.match(messageSrc, new RegExp(`"${kind}"`), `${kind} needs a label`);
    assert.match(
      itemSrc,
      new RegExp(`case "${kind}"`),
      `${kind} needs an icon`,
    );
  }
});
