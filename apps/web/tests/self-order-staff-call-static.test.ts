import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const readWeb = (path: string) => readFileSync(join(root, path), "utf8");
const readRepo = (path: string) =>
  readFileSync(join(root, "../..", path), "utf8");

test("guest staff-call notifies POS without a second order request", () => {
  const migration = readRepo(
    "supabase/migrations/20260814001447_self_order_staff_call.sql",
  );
  const route = readWeb("app/api/self-order/[token]/staff-call/route.ts");
  const server = readWeb("lib/self-order/server.ts");
  const client = readWeb("app/q/[token]/self-order-client.tsx");
  const messages = readRepo("packages/shared/src/messages/self-order.ts");
  const actions = readWeb(
    "app/(protected)/br/[branchId]/pos/self-order-actions.ts",
  );
  const tables = readWeb("app/(protected)/br/[branchId]/pos/pos-table-gate.tsx");
  const sync = readWeb(
    "app/(protected)/br/[branchId]/pos/_hooks/use-pos-menu-sync.ts",
  );

  assert.match(migration, /CREATE TABLE public\.self_order_staff_calls/);
  assert.match(migration, /self_order_staff_calls_one_pending_per_table/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.self_order_call_staff/);
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.self_order_ack_staff_call/,
  );
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.self_order_call_staff/);
  assert.match(migration, /TO service_role/);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.self_order_ack_staff_call/,
  );
  assert.match(migration, /trg_broadcast_branch_ops ON public\.self_order_staff_calls/);

  assert.match(route, /callSelfOrderStaff/);
  assert.match(route, /selfOrderStaffCallRequestSchema/);
  assert.match(server, /"self_order_call_staff"/);
  assert.match(client, /\/staff-call`/);
  assert.match(client, /SELF_ORDER_VI\.callStaff/);
  assert.match(client, /aria-label=\{SELF_ORDER_VI\.callStaff\}/);
  assert.match(client, /staffCallClientOpIdRef\.current = null/);
  assert.match(actions, /PGRST205/);
  assert.match(messages, /callStaff: "Gọi nhân viên"/);
  assert.match(messages, /staffCallBadge: "Gọi NV"/);

  assert.match(actions, /staffCalls/);
  assert.match(actions, /self_order_ack_staff_call/);
  assert.match(tables, /staffCallTableIds/);
  assert.match(tables, /SELF_ORDER_VI\.staffCallBadge/);
  assert.match(sync, /self_order_staff_calls/);
});

test("awaiting copy leads with sent-and-wait, not browse-more", () => {
  const messages = readRepo("packages/shared/src/messages/self-order.ts");
  assert.match(messages, /pendingDialogTitle: "Đã gửi đơn"/);
  assert.match(messages, /Vui lòng chờ nhân viên duyệt/);
  assert.match(messages, /awaitingCalloutTitle: "Đang chờ nhân viên duyệt đơn"/);
  assert.doesNotMatch(messages, /Đã gửi đơn cho Thu Ngân/);
});
