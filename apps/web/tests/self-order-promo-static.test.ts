import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch } from "./_lib/active-sql.ts";


const root = process.cwd();
const readWeb = (path: string) => readSql(root, path);
const readRepo = (path: string) =>
  readSql(join(root, "../.."), path);

const migration = readRepo(
  "supabase/migrations/20260819131047_self_order_guest_promotion_code.sql",
);

test("guest promo RPCs stay service_role SECURITY DEFINER and fail closed for picker kinds", () => {
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.self_order_apply_promotion_code/,
  );
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.self_order_clear_promotion/,
  );
  assertSqlMatch(migration, /SECURITY DEFINER/);
  assertSqlMatch(migration, /SET search_path TO ''/);
  assertSqlMatch(migration, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assertSqlMatch(migration,
    /GRANT ALL ON FUNCTION public\.self_order_apply_promotion_code\(text, uuid, text\)\s+TO service_role/,
  );
  assertSqlMatch(migration,
    /GRANT ALL ON FUNCTION public\.self_order_clear_promotion\(text, uuid\)\s+TO service_role/,
  );
  assertSqlMatch(migration,
    /REVOKE ALL ON FUNCTION public\.self_order_apply_promotion_code\(text, uuid, text\)\s+FROM PUBLIC, anon, authenticated/,
  );
  assertSqlMatch(migration,
    /kind IN \('free_side', 'free_item', 'bxgy'\)/,
  );
  assertSqlMatch(migration,
    /kind NOT IN \('order_pct', 'order_vnd', 'voucher_face'\)/,
  );
  assertSqlMatch(migration, /promotion_guest_staff_required/);
  assertSqlMatch(migration, /self_order_active_payment_intent/);
  assertSqlMatch(migration, /'orderDiscountAmount', COALESCE\(o\.order_discount_amount, 0\)/);
  assertSqlMatch(migration, /'itemDiscountAmount', COALESCE\(o\.item_discount_amount, 0\)/);
  assertSqlMatch(migration, /'discountAmount', COALESCE\(oi\.discount_amount, 0\)/);
  assertSqlMatch(migration, /'discount_amount', COALESCE\(SUM\(oi\.discount_amount\), 0\)/);
});

test("guest promo API and bill UI wire apply, clear, and line amounts", () => {
  const applyRoute = readWeb("app/api/self-order/[token]/promotion/route.ts");
  const clearRoute = readWeb(
    "app/api/self-order/[token]/promotion/clear/route.ts",
  );
  const server = readWeb("lib/self-order/server.ts");
  const client = readWeb("app/q/[token]/self-order-client.tsx");
  const bill = readWeb("app/q/[token]/self-order/bill-drawer.tsx");
  const summary = readWeb("app/q/[token]/self-order/order-summary.tsx");
  const panel = readWeb("app/q/[token]/self-order/promo-code-panel.tsx");
  const messages = readRepo("packages/shared/src/messages/self-order.ts");
  const posMessages = readRepo("packages/shared/src/messages/pos.ts");
  const posRow = readWeb(
    "app/(protected)/br/[branchId]/pos/_components/order-detail/order-item-row.tsx",
  );
  const guestUi = readRepo("docs/spec/self-order-guest-ui.md");

  assert.match(applyRoute, /applySelfOrderPromotionCode/);
  assert.match(clearRoute, /clearSelfOrderPromotion/);
  assert.match(applyRoute, /validateSelfOrderMutationRequest/);
  assert.match(server, /"self_order_apply_promotion_code"/);
  assert.match(server, /"self_order_clear_promotion"/);
  assert.match(server, /purpose: "batch"/);
  assert.match(server, /mapPromotionRpcError/);
  assert.match(
    client,
    /\/api\/self-order\/\$\{encodeURIComponent\(token\)\}\/promotion/,
  );
  assert.match(
    client,
    /\/api\/self-order\/\$\{encodeURIComponent\(token\)\}\/promotion\/clear/,
  );
  assert.match(bill, /SelfOrderPromoPanel/);
  assert.match(
    bill,
    /<SheetFooter className="shrink-0[\s\S]*SelfOrderPromoPanel/,
  );
  assert.match(summary, /SELF_ORDER_VI\.linePromo/);
  assert.match(panel, /SELF_ORDER_VI\.promoCodeLabel/);
  assert.match(panel, /controlSize="touch"/);
  assert.match(messages, /promoCodeLabel: "Mã khuyến mãi"/);
  assert.match(guestUi, /Mã khuyến mãi/);
  assert.match(messages, /promoStaffRequired/);
  assert.match(posMessages, /itemDiscountLine/);
  assert.match(posRow, /POS_VI\.itemDiscountLine/);
  assert.match(posRow, /originalTotal=/);
  assert.match(guestUi, /self_order_apply_promotion_code/);
  assert.match(guestUi, /Khuyến mãi: -X/);
  assert.equal(
    existsSync(
      join(root, "app/api/self-order/[token]/promotion/route.ts"),
    ),
    true,
  );
});
