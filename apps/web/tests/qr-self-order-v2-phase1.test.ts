import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), "../..", path), "utf8");
}

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("snapshot migration returns order.items array", () => {
  const migration = readRepo(
    "supabase/migrations/20260708140000_self_order_snapshot_order_items.sql",
  );

  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.self_order_get_snapshot\(p_token text\)/);
  assert.match(migration, /v_order_items jsonb := NULL/);
  assert.match(migration, /jsonb_agg\([\s\S]*ORDER BY oi\.id\)/);
  // COALESCE wraps jsonb_agg so empty orders return '[]' instead of null.
  assert.match(migration, /COALESCE\(/);
  assert.match(migration, /'\[\]'::jsonb/);
  // Items subquery must be scoped by tenant.
  assert.match(migration, /oi\.tenant_id = v_session\.tenant_id/);
  assert.match(migration, /oi\.status <> 'cancelled'/);
  assert.match(migration, /'items', v_order_items/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.self_order_get_snapshot\(text\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT ALL ON FUNCTION public\.self_order_get_snapshot\(text\) TO service_role/);
});

test("snapshot contract type includes order.items line type", () => {
  const contracts = readWeb("lib/self-order/contracts.ts");

  assert.match(contracts, /export interface SelfOrderOrderLine \{/);
  assert.match(contracts, /menuItemId: number;/);
  assert.match(contracts, /itemName: string;/);
  assert.match(contracts, /variantName: string \| null;/);
  assert.match(contracts, /quantity: number;/);
  assert.match(contracts, /unitPrice: number;/);
  assert.match(contracts, /lineTotal: number;/);
  assert.match(contracts, /note: string \| null;/);
  assert.match(contracts, /items: SelfOrderOrderLine\[\];/);
});

test("SELF_ORDER_VI has v2 phase1 status and CTA keys", () => {
  const messages = readRepo("packages/shared/src/messages/self-order.ts");

  assert.match(messages, /statusPendingApproval:/);
  assert.match(messages, /statusActive:/);
  assert.match(messages, /statusAwaitingVietQr:/);
  assert.match(messages, /statusAwaitingCash:/);
  assert.match(messages, /statusClosed:/);
  assert.match(messages, /ctaAwaitingApproval:/);
  assert.match(messages, /ctaAwaitingApprovalHint:/);
  assert.match(messages, /orderedItemsTitle:/);
  assert.match(messages, /orderedItemsShowMore:/);
});

test("status-pill renders mapped SELF_ORDER_VI labels by session state", () => {
  const pill = readWeb("app/q/[token]/self-order/status-pill.tsx");

  assert.match(pill, /import \{ Badge, type BadgeProps \} from "@comtammatu\/ui\/components\/badge"/);
  assert.match(pill, /SELF_ORDER_VI\.statusPendingApproval/);
  assert.match(pill, /SELF_ORDER_VI\.statusActive/);
  assert.match(pill, /SELF_ORDER_VI\.statusAwaitingVietQr/);
  assert.match(pill, /SELF_ORDER_VI\.statusAwaitingCash/);
  assert.match(pill, /SELF_ORDER_VI\.statusClosed/);
  assert.match(pill, /variant: "warning"/);
  assert.match(pill, /variant: "success"/);
  assert.match(pill, /variant: "info"/);
});
