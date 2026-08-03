import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const repoRoot = new URL("../../../", import.meta.url);
const migration = readFileSync(
  new URL(
    "supabase/migrations/20260803051613_add_self_order_momo_wallet_payment.sql",
    repoRoot,
  ),
  "utf8",
);
const webhook = readFileSync(
  new URL("apps/web/app/api/webhooks/momo/route.ts", repoRoot),
  "utf8",
);
const worker = readFileSync(
  new URL("apps/web/lib/momo-reconciliation-worker.ts", repoRoot),
  "utf8",
);
const vercel = readFileSync(new URL("apps/web/vercel.json", repoRoot), "utf8");

test("MoMo intent is reserved before create and binds exact provider links", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.self_order_create_momo_payment_request/,
  );
  assert.match(
    migration,
    /INSERT INTO public\.payments[\s\S]*?'momo'[\s\S]*?'pending'/,
  );
  assert.match(migration, /replace\(p_client_op_id::text, '-', ''\)/);
  assert.match(
    migration,
    /v_payment\.provider_ref IS DISTINCT FROM p_provider_data ->> 'momoOrderId'/,
  );
  assert.match(migration, /payment\.provider_data ->> 'deeplink'/);
  assert.doesNotMatch(migration, /payment\.provider_data ->> 'qrCodeUrl'/);
  assert.doesNotMatch(migration, /p_provider_data ->> 'qrCodeUrl'/);
});

test("MoMo settlement is signed, scoped, amount-bound, and service-only", () => {
  assert.match(webhook, /gateway\.verifyIpn\(payload\)/);
  assert.match(webhook, /claimWebhook/);
  assert.match(webhook, /"record_momo_payment_result"/);
  assert.match(migration, /v_payment\.tenant_id <> v_event\.tenant_id/);
  assert.match(migration, /v_amount IS DISTINCT FROM v_payment\.amount/);
  assert.match(migration, /v_result_code NOT IN \(0, 9000\)/);
  assert.match(migration, /public\.complete_payment_and_consume_stock/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.record_momo_payment_result/,
  );
  assert.match(migration, /TO service_role/);
});

test("MoMo reconciliation queries stale pending payments without trusting redirect", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.claim_pending_momo_reconciliations/,
  );
  assert.match(migration, /FOR UPDATE OF payment SKIP LOCKED/);
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.record_momo_query_result/,
  );
  assert.match(migration, /momo_query_scope_mismatch/);
  assert.match(worker, /gateway\.queryPayment/);
  assert.match(worker, /"record_momo_query_result"/);
  assert.match(vercel, /"path": "\/api\/cron\/momo-reconcile"/);
});
