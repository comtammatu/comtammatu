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

test("awaiting guests keep ordering under an in-flow wait banner", () => {
  const client = readWeb("app/q/[token]/self-order-client.tsx");
  const messages = readRepo("packages/shared/src/messages/self-order.ts");
  const summary = readWeb("app/q/[token]/self-order/order-summary.tsx");

  assert.match(client, /const ctaDisabled = false;/);
  assert.match(client, /const ctaLabel =\s*open \|\| awaiting/);
  assert.doesNotMatch(client, /const isFirstPendingSubmit = !awaiting/);
  assert.doesNotMatch(client, /<AppDialog/);
  assert.match(client, /role="status"/);
  assert.match(client, /pendingDialogTitle/);
  assert.match(client, /pendingDialogDescription/);
  assert.doesNotMatch(
    client,
    /toast\.warning\(SELF_ORDER_VI\.awaitingCalloutTitle/,
  );
  assert.match(messages, /pendingDialogTitle: "Đã gửi đơn"/);
  assert.match(
    messages,
    /pendingDialogDescription:\s*"Đơn đã được gửi tới quầy thu ngân\. Món sẽ được đưa vào bếp ngay sau khi duyệt\."/,
  );
  assert.match(messages, /continueBrowsing: "Tiếp tục xem thực đơn"/);
  assert.match(messages, /callStaff: "Gọi nhân viên"/);
  assert.match(summary, /opacity-50/);
  assert.doesNotMatch(summary, /blur-\[2px\]/);
  assert.doesNotMatch(summary, /backdrop-blur/);
  assert.match(summary, /<BrandMascot decorative size="sm"/);
  assert.match(summary, /role="status"/);
});
