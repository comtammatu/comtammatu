import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  selfOrderMomoResponseSchema,
  selfOrderPaymentRequestSchema,
  publicSelfOrderAvailableSnapshotSchema,
} from "../lib/self-order/contracts";

const root = join(process.cwd(), "../..");
const migration = readFileSync(
  join(
    root,
    "supabase/migrations/20260716093516_self_order_momo_deeplink_checkout.sql",
  ),
  "utf8",
);

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("Self-Order MoMo keeps one guarded pending intent with service-only RPCs", () => {
  assert.match(
    migration,
    /self_order_payment_requests_method_check[\s\S]*'momo'/,
  );
  assert.match(
    migration,
    /self_order_payment_requests_one_active_per_order[\s\S]*'momo_pending'/,
  );
  assert.match(migration, /self_order_create_momo_payment_request/);
  assert.match(migration, /self_order_claim_momo_checkout/);
  assert.match(migration, /self_order_set_momo_checkout/);
  assert.match(migration, /self_order_recover_momo_checkout_request/);
  assert.match(migration, /self_order_apply_momo_query_result/);
  assert.match(migration, /self_order_momo_unavailable/);
  assert.match(
    migration,
    /NEW\.payment_status = 'unpaid'[\s\S]*payment\.status = 'failed'/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.self_order_create_momo_payment_request[\s\S]*TO service_role/,
  );
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.self_order_create_momo_payment_request[\s\S]*TO authenticated/,
  );
});

test("MoMo public payload requires a persisted checkout URL and exposes no buyer data", () => {
  const parsed = selfOrderMomoResponseSchema.safeParse({
    ok: true,
    id: 7,
    clientOpId: "ee023e0f-618c-4b72-b6bc-580030845214",
    status: "momo_pending",
    method: "momo",
    amount: 125_000,
    paymentId: 93,
    paymentCode: "MTSO-42-0123456789abcdef0123",
    momoDeeplink: "momo://app/payment/checkout-token",
    createdAt: "2026-07-16T01:00:00+00:00",
    expiresAt: "2026-07-16T01:15:00+00:00",
  });
  assert.equal(parsed.success, true);
  assert.equal(
    selfOrderMomoResponseSchema.safeParse({
      ok: true,
      status: "momo_pending",
      method: "momo",
      amount: 125_000,
      paymentCode: "MTSO-42-0123456789abcdef0123",
      createdAt: "2026-07-16T01:00:00+00:00",
      expiresAt: "2026-07-16T01:15:00+00:00",
    }).success,
    false,
  );
  assert.equal(
    selfOrderPaymentRequestSchema.safeParse({
      clientOpId: "ee023e0f-618c-4b72-b6bc-580030845214",
      method: "momo",
    }).success,
    true,
  );
  assert.doesNotMatch(migration, /'momoDeeplink',[\s\S]{0,800}invoice_payload/);
});

test("browser deeplink and return are not payment settlement authority", () => {
  const client = readWeb("app/q/[token]/self-order-client.tsx");
  const returnPage = readWeb("app/(public)/payment/momo/return/page.tsx");
  const webhook = readWeb("app/api/webhooks/momo/route.ts");
  const cron = readWeb("app/api/cron/momo-reconcile/route.ts");

  assert.match(client, /window\.location\.assign\(checkoutUrl\)/);
  assert.match(client, /get\("momo"\) !== "returned"/);
  assert.doesNotMatch(client, /momo[\s\S]{0,300}setPaymentCompleted\(true\)/);
  assert.match(
    returnPage,
    /redirect\(`\/q\/\$\{encodeURIComponent\(tableToken\)\}\?momo=returned`\)/,
  );
  assert.match(
    webhook,
    /provider\.verifyWebhook\(payload, payload\.signature\)/,
  );
  assert.match(webhook, /finalize_momo_successful_payment/);
  assert.match(cron, /getCronSecret\(\)/);
  assert.match(cron, /MOMO_RECONCILE_ENABLED/);
  assert.match(cron, /self_order_apply_momo_query_result/);
});

test("Self-Order hides MoMo when the tenant kill switch is disabled", () => {
  const server = readWeb("lib/self-order/server.ts");
  const client = readWeb("app/q/[token]/self-order-client.tsx");
  const paymentPanel = readWeb(
    "app/q/[token]/self-order/payment-panel.tsx",
  );

  assert.match(server, /SYSTEM_SETTING_KEYS\.PAYMENT_ENABLE_MOMO/);
  assert.match(server, /loadMomoEnabledForScope/);
  assert.match(client, /momoEnabled=\{available\.momoEnabled\}/);
  assert.match(
    paymentPanel,
    /\{momoEnabled \? \([\s\S]*onRequestPayment\("momo"\)/,
  );

  const baseSnapshot = {
    ok: true as const,
    state: "unopened" as const,
    branch: { name: "Má Tư" },
    table: { id: 1, number: 1 },
    openOrderCount: 0,
    order: null,
    rounds: [],
    request: null,
    paymentRequest: null,
    menu: [],
  };
  assert.equal(
    publicSelfOrderAvailableSnapshotSchema.parse(baseSnapshot).momoEnabled,
    false,
  );
  assert.equal(
    publicSelfOrderAvailableSnapshotSchema.parse({
      ...baseSnapshot,
      momoEnabled: true,
    }).momoEnabled,
    true,
  );
});
