import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { normalizeEol } from "./static-source";

const root = process.cwd();
const readWeb = (path: string) =>
  normalizeEol(readFileSync(join(root, path), "utf8"));
const readRepo = (path: string) =>
  normalizeEol(readFileSync(join(root, "../..", path), "utf8"));

test("pending self-order additions merge through an idempotent operation ledger", () => {
  const migration = readRepo(
    "supabase/migration-archive/20260716180000_restore_self_order_pending_add_more.sql",
  );

  assert.match(migration, /CREATE TABLE public\.self_order_request_operations/);
  assert.match(migration, /PRIMARY KEY \(tenant_id, client_op_id\)/);
  assert.match(
    migration,
    /REVOKE ALL PRIVILEGES ON TABLE public\.self_order_request_operations/,
  );
  assert.match(
    migration,
    /ALTER TABLE public\.self_order_request_operations ENABLE ROW LEVEL SECURITY/,
  );
  assert.match(migration, /v_pending_request\.cart_payload \|\| v_items/);
  assert.match(migration, /v_merged_note := NULLIF\([\s\S]*concat_ws/);
  assert.match(migration, /INSERT INTO public\.self_order_request_operations/);
  assert.match(migration, /'idempotent', true/);
  assert.match(migration, /pg_advisory_xact_lock/);

  const pendingBranch = migration.slice(
    migration.indexOf("IF FOUND THEN\n    v_merged_items"),
    migration.indexOf("  SELECT count(*)::integer"),
  );
  assert.match(
    pendingBranch,
    /UPDATE public\.self_order_requests[\s\S]*SET cart_payload = v_merged_items/,
  );
  assert.doesNotMatch(pendingBranch, /INSERT INTO public\.self_order_requests/);
});

test("awaiting guests can continue ordering while the first confirmation is a dialog", () => {
  const client = readWeb("app/q/[token]/self-order-client.tsx");
  const messages = readRepo("packages/shared/src/messages/self-order.ts");
  const summary = readWeb("app/q/[token]/self-order/order-summary.tsx");

  assert.match(client, /const ctaDisabled = false;/);
  assert.match(client, /const ctaLabel =\s*open \|\| awaiting/);
  assert.match(client, /const isFirstPendingSubmit = !awaiting/);
  assert.match(
    client,
    /parsedSnapshot\.data\.state === "awaiting_confirmation"[\s\S]*isFirstPendingSubmit/,
  );
  assert.match(client, /<AppDialog/);
  assert.doesNotMatch(
    client,
    /toast\.warning\(SELF_ORDER_VI\.awaitingCalloutTitle/,
  );
  assert.match(messages, /pendingDialogTitle: "Đã gửi đơn"/);
  assert.match(
    messages,
    /pendingDialogDescription:\s*"Vui lòng chờ nhân viên duyệt\. Món vào bếp sau khi được duyệt\."/,
  );
  assert.match(messages, /acknowledge: "Đã hiểu"/);
  assert.match(messages, /callStaff: "Gọi nhân viên"/);
  assert.match(summary, /blur-\[2px\]/);
  assert.match(summary, /<BrandMascot decorative size="sm"/);
  assert.match(summary, /role="status"/);
});
