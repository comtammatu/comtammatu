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
    "supabase/migrations/20260601780000_payment_completion_failhard_recompute.sql",
  );

  assert.match(source, /amount_mismatch_recomputed/);
  assert.match(source, /SUM\(oi\.quantity::NUMERIC \* oi\.unit_price\)/);
  assert.match(source, /'stock_failed'::TEXT/);
  assert.doesNotMatch(source, /Stock consumption remains fail-soft/i);
});

test("VietQR confirm uses fail-hard payment completion instead of caller-side stock deduction", () => {
  const migration = readRepoFile(
    "supabase/migrations/20260601930000_harden_confirm_vietqr_payment.sql",
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
