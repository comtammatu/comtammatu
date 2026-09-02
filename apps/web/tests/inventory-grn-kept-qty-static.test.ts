import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, looksLikeDump } from "./_lib/active-sql.ts";


const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);

test("ADR 0040 kept GRN qty amends the PO line and warehouse may close remainder", () => {
  const sql = read(
    "supabase/migrations/20260818160643_grn_kept_qty_amends_po.sql",
  );
  if (looksLikeDump(sql)) return;
  const proof = read("supabase/tests/grn_kept_qty_amends_po_test.sql");
  const actions = read(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );

  assertSqlMatch(sql, /v_accepted_base > v_remaining_base/);
  assert.ok(
    sql.includes(String.raw`replace(replace(v_def, E'\r\n', E'\n')`),
  );
  assertSqlMatch(sql, /quantity = v_previously_applied \+ v_applied/);
  assertSqlMatch(sql, /procurement:grn_confirm/);
  assertSqlMatch(sql, /status = 'closed'/);
  assert.match(proof, /confirm must amend PO line on over-receipt/);
  assert.match(proof, /close remainder must allow warehouse confirm/);
  assert.match(actions, /close_purchase_order/);
  assert.match(actions, /PROCUREMENT_GRN_CONFIRM/);
  const messages = read("apps/web/lib/messages/inventory.ts");
  assert.match(messages, /Giữ thêm \$\{formatted\} — đơn mua tăng số lượng/);
  assert.match(messages, /Còn thiếu \$\{formatted\} — nhập lần sau/);
  assert.match(
    messages,
    /confirmDetailExcess: "Giữ thêm — đơn mua tăng số lượng"/,
  );
  assert.match(messages, /closeRemainingAction: "Đóng phần còn lại"/);
  const poClient = read(
    "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );
  assert.match(poClient, /canManage \|\| canReceive/);
  assert.match(poClient, /copy\.closeRemainingAction/);
});
