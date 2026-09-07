import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  assertSqlMatch,
  extractSqlFunction,
  readActiveMigrationSql,
  readSql,
} from "./_lib/active-sql.ts";

const root = join(import.meta.dirname, "../../..");
const webRoot = join(import.meta.dirname, "..");

function readWeb(path: string): string {
  return readFileSync(join(webRoot, path), "utf8");
}

test("branch DC receive pad lets a store choose Kho or Bếp", () => {
  const receiveClient = readWeb(
    "app/(protected)/br/[branchId]/(operator)/stock/receive/[id]/transfer-receive-client.tsx",
  );
  const receivePage = readWeb(
    "app/(protected)/br/[branchId]/(operator)/stock/receive/[id]/page.tsx",
  );
  const actions = readWeb("app/(protected)/inventory/transfer-actions.ts");
  const messages = readWeb("lib/messages/inventory.ts");

  assert.match(receivePage, /receiveLocations=/);
  assert.match(receiveClient, /receiveLocations/);
  assert.match(receiveClient, /<ToggleGroup/);
  assert.match(receiveClient, /size="touch"/);
  assert.match(receiveClient, /locations\.warehouse\.id/);
  assert.match(receiveClient, /locations\.kitchen\.id/);
  assert.match(receiveClient, /transferReceive\([\s\S]*toLocationId/);
  assert.match(actions, /p_to_location_id:/);
  assert.match(messages, /receiveLocationTitle:\s*"Nhận vào"/);
  assert.match(messages, /receiveLocationWarehouse:\s*"Kho"/);
  assert.match(messages, /receiveLocationKitchen:\s*"Bếp"/);
});

test("stock_transfer_receive can override the destination to a store kitchen", () => {
  const active = readActiveMigrationSql(root);
  const execute = extractSqlFunction(
    active,
    "private.execute_stock_transfer_receive",
  );
  const wrapper = extractSqlFunction(active, "public.stock_transfer_receive");
  const inventory = readSql(root, "docs/ref/inventory.md");

  assert.match(execute, /p_to_location_id bigint DEFAULT NULL/);
  assert.match(wrapper, /p_to_location_id bigint DEFAULT NULL/);
  assertSqlMatch(
    execute,
    /v_dest_id := COALESCE\(p_to_location_id, v_tr\.to_location_id\)/,
  );
  assertSqlMatch(execute, /location_kind = 'kitchen'/);
  assertSqlMatch(execute, /branch_kind IS DISTINCT FROM 'branch'/);
  assertSqlMatch(
    execute,
    /SET to_location_id = v_dest_id/,
  );
  assert.match(wrapper, /p_to_location_id/);
  assert.match(
    inventory,
    /chi nhánh thường nhận vào Kho hoặc Bếp/,
  );
});
