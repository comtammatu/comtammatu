import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const repoRoot = new URL("../../../../../", import.meta.url);

function readRepoFile(path: string): string {
  const candidate = new URL(path, repoRoot);
  if (existsSync(candidate)) return readFileSync(candidate, "utf8");
  if (path.startsWith("supabase/migrations/")) {
    return readFileSync(
      new URL(
        path.replace("supabase/migrations/", "supabase/migrations/_archive/"),
        repoRoot,
      ),
      "utf8",
    );
  }
  return readFileSync(candidate, "utf8");
}

test("MoMo webhook binds payment lookup to signed tenant/order scope", () => {
  const source = readRepoFile("apps/web/app/api/webhooks/momo/route.ts");

  assert.match(
    source,
    /\.from\("payments"\)[\s\S]*\.eq\("tenant_id", extra\.tenantId\)[\s\S]*\.eq\("order_id", extra\.orderId\)[\s\S]*\.eq\("provider_ref", payload\.orderId\)[\s\S]*\.eq\("method", "momo"\)/,
  );
});

test("SePay webhook verifies raw-body HMAC and returns SePay success JSON", () => {
  const source = readRepoFile("apps/web/app/api/webhooks/sepay/route.ts");

  assert.match(source, /await request\.text\(\)/);
  assert.doesNotMatch(source, /await request\.json\(\)/);
  assert.match(source, /request\.headers\.get\("x-sepay-signature"\)/);
  assert.match(source, /request\.headers\.get\("x-sepay-timestamp"\)/);
  assert.match(source, /createHmac\("sha256", SEPAY_WEBHOOK_SECRET\)/);
  assert.match(source, /update\(`\$\{timestampHeader\}\.\$\{rawBody\}`\)/);
  assert.match(source, /NextResponse\.json\(\{ success: true \}\)/);
});

test("SePay webhook claims idempotency before payment settlement RPC", () => {
  const source = readRepoFile("apps/web/app/api/webhooks/sepay/route.ts");

  assert.match(source, /PAYMENT_CODE_RE/);
  assert.match(source, /function extractPaymentCode/);
  assert.match(source, /function resolveAccountScope/);
  assert.match(source, /\.from\("system_settings"\)/);
  assert.match(source, /\.eq\("key", "payment_vietqr_account_no"\)/);
  assert.match(source, /\.eq\("value", normalizedAccount\)/);
  assert.match(source, /\.from\("payments"\)/);
  assert.match(source, /\.eq\("tenant_id", tenantId\)/);
  assert.match(source, /\.eq\("method", "vietqr"\)/);
  assert.match(source, /\.ilike\("provider_ref", paymentCode\)/);
  assert.match(source, /p_tenant_id: accountScope\.tenantId/);
  assert.match(source, /p_payment_id: paymentScope\.paymentId/);
  assert.match(source, /p_provider_ref: paymentCode/);
  assert.doesNotMatch(source, /p_order_number/);
  assert.match(source, /provider: "sepay"/);
  assert.match(source, /request_id: input\.requestId/);

  const claimIndex = source.indexOf(
    "const webhookClaim = await claimWebhookEvent",
  );
  const rpcIndex = source.indexOf('.rpc("confirm_sepay_payment"');
  assert.ok(claimIndex > 0, "claim call should exist");
  assert.ok(rpcIndex > 0, "confirm_sepay_payment RPC call should exist");
  assert.ok(claimIndex < rpcIndex, "claim must happen before settlement RPC");
});

test("SePay migration extends webhook provider check and keeps RPC service-only", () => {
  const source = readRepoFile(
    "supabase/migrations/20260625171721_sepay_webhook_payment.sql",
  );

  assert.match(source, /webhook_events_provider_check/);
  assert.match(source, /'sepay'::text/);
  assert.match(source, /idx_payments_vietqr_provider_ref_active/);
  assert.match(source, /p_method NOT IN \('cash', 'momo', 'vietqr'\)/);
  assert.match(source, /payment_pending_different_method/);
  assert.match(source, /p\.tenant_id = p_tenant_id/);
  assert.match(source, /p\.id = p_payment_id/);
  assert.match(
    source,
    /lower\(p\.provider_ref\) = lower\(btrim\(p_provider_ref\)\)/,
  );
  assert.match(source, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(source, /account_config_missing/);
  assert.match(
    source,
    /CREATE OR REPLACE FUNCTION public\.confirm_sepay_payment/,
  );
  assert.match(
    source,
    /REVOKE ALL ON FUNCTION public\.confirm_sepay_payment\(bigint, bigint, text, numeric, text, text, jsonb\) FROM PUBLIC;/,
  );
  assert.match(
    source,
    /REVOKE ALL ON FUNCTION public\.confirm_sepay_payment\(bigint, bigint, text, numeric, text, text, jsonb\) FROM anon;/,
  );
  assert.match(
    source,
    /REVOKE ALL ON FUNCTION public\.confirm_sepay_payment\(bigint, bigint, text, numeric, text, text, jsonb\) FROM authenticated;/,
  );
  assert.match(
    source,
    /GRANT EXECUTE ON FUNCTION public\.confirm_sepay_payment\(bigint, bigint, text, numeric, text, text, jsonb\) TO service_role;/,
  );
  assert.match(
    source,
    /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public\.webhook_events FROM anon;/,
  );
  assert.match(
    source,
    /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public\.webhook_events FROM authenticated;/,
  );
  assert.match(
    source,
    /DROP FUNCTION IF EXISTS public\.confirm_sepay_payment\(text, numeric, text, text, jsonb\);/,
  );
});

test("Webhook event audit table is not selectable by anon", () => {
  const source = readRepoFile(
    "supabase/migrations/20260626021425_revoke_webhook_events_anon_select.sql",
  );

  assert.match(
    source,
    /REVOKE SELECT ON TABLE public\.webhook_events FROM anon;/,
  );
});

test("POS VietQR creates a pending payment row before rendering transfer QR", () => {
  const schema = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/pos/_lib/payment-schemas.ts",
  );
  const action = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts",
  );
  const bill = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx",
  );

  assert.match(schema, /z\.enum\(\["cash", "vietqr", "momo"\]\)/);
  assert.match(action, /new VietQRProvider/);
  assert.match(action, /p_method: method/);
  assert.match(action, /p_provider_ref: providerResult\.providerRef/);
  assert.doesNotMatch(bill, /buildVietQrEmvco/);
  assert.match(bill, /const result = await createPayment\(/);
});

test("VietQR bank account configuration lives in Admin settings, not env", () => {
  const envExample = readRepoFile(".env.example");
  const paymentActions = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts",
  );
  const providerInit = readRepoFile("apps/web/lib/payment-providers-init.ts");

  assert.doesNotMatch(envExample, /VIETQR_/);
  assert.doesNotMatch(
    paymentActions,
    /process\.env(?:\[[^\]]*VIETQR_|\.VIETQR_)/,
  );
  assert.doesNotMatch(providerInit, /VIETQR_|VietQRProvider/);
});

test("MoMo webhook accepts completed unconditionally per no-stock-deduction policy, keeps defensive stock_failed 500", () => {
  const source = readRepoFile("apps/web/app/api/webhooks/momo/route.ts");

  // No-stock-deduction policy (migration 20260611001000): completed /
  // already_completed accepted unconditionally, no stock_consumed gate.
  assert.doesNotMatch(source, /stock_consumed === true/);
  assert.match(source, /case "completed":\s*\n\s*case "already_completed":/);
  // stock_failed stays defensive (pre-migration RPC) and fail-closed 500
  // so MoMo retries.
  assert.match(source, /case "stock_failed":/);
  assert.match(source, /error_code: "stock_consumption_failed"/);
  assert.match(source, /status: 500/);
});

test("payment completion migration recomputes amount and does not complete on stock failure", () => {
  const source = readRepoFile(
    "supabase/migrations/_archive/20260601780000_payment_completion_failhard_recompute.sql",
  );

  assert.match(source, /amount_mismatch_recomputed/);
  assert.match(source, /SUM\(oi\.quantity::NUMERIC \* oi\.unit_price\)/);
  assert.match(source, /'stock_failed'::TEXT/);
  assert.doesNotMatch(source, /Stock consumption remains fail-soft/i);
});

test("VietQR confirm uses fail-hard payment completion instead of caller-side stock deduction", () => {
  const migration = readRepoFile(
    "supabase/migrations/_archive/20260601930000_harden_confirm_vietqr_payment.sql",
  );
  const action = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts",
  );
  const vietQrAction = action.slice(
    action.indexOf("export async function confirmVietQrPayment("),
    action.indexOf("/* ─── confirmVietQrPaymentWithInvoice"),
  );

  assert.match(migration, /complete_payment_and_consume_stock/);
  assert.match(migration, /'stock_failed'/);
  assert.match(migration, /amount_mismatch_recomputed/);
  assert.doesNotMatch(
    migration,
    /Stock consumption is done by the server action caller/i,
  );
  assert.match(vietQrAction, /result\.status/);
  assert.doesNotMatch(vietQrAction, /consumeStockForOrderCompat/);
});
