/**
 * MONEY integration suite (audit TEST-01..05 / TS-03).
 *
 * Exercises the REAL money RPCs against the lean Supabase project (uozwee),
 * each inside a transaction that is ALWAYS rolled back, so the database stays
 * clean. Covers the payment + invoice + cash surfaces and asserts the HKD lean
 * invariant that a SALE creates NO stock_movements row ("không trừ kho").
 *
 * Run:  pnpm --filter @comtammatu/web exec tsx --test tests/integration/money.integration.test.ts
 * Skips automatically when uozwee creds are absent (e.g. CI without secrets).
 *
 * RPCs covered: confirm_cash_payment, confirm_vietqr_payment, create_refund,
 * aggregate_daily_b2c_invoice (+ transition_tax_invoice_state_as_system),
 * cash_entries INSERT/SELECT under RLS, and a signed MoMo IPN verification.
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test, before, after } from "node:test";
import type { Client } from "pg";
import { MoMoProvider } from "@comtammatu/shared/providers";
import {
  countSaleStockMovements,
  createOrder,
  hasIntegrationCreds,
  makeClient,
  seedActorAndMenu,
  setAuthContext,
  type TestActor,
} from "./_helpers";

const TENANT_ID = 1;
const BRANCH_ID = 1;
const RUN = hasIntegrationCreds();

let client: Client;

before(async () => {
  if (!RUN) return;
  client = makeClient();
  await client.connect();
});

after(async () => {
  if (!RUN || !client) return;
  await client.end();
});

/**
 * Run `fn` inside a transaction that is always rolled back. Seeds an owner
 * actor + menu item, sets the auth context, and hands both to the test body.
 */
async function inRolledBackTx(
  fn: (ctx: {
    actor: TestActor;
    menuItemId: number;
    basePrice: number;
  }) => Promise<void>,
): Promise<void> {
  await client.query("BEGIN");
  try {
    const seed = await seedActorAndMenu(client, {
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
    });
    await setAuthContext(client, seed.actor);
    await fn(seed);
  } finally {
    await client.query("ROLLBACK");
  }
}

test(
  "confirm_cash_payment completes the sale and writes NO stock_movements (không trừ kho)",
  { skip: RUN ? false : "uozwee creds absent" },
  async () => {
    await inRolledBackTx(async ({ actor, menuItemId }) => {
      const { orderId, total } = await createOrder(
        client,
        actor,
        menuItemId,
        2,
      );

      const res = await client.query(
        "SELECT public.confirm_cash_payment($1, $2) AS r",
        [orderId, total],
      );
      const out = res.rows[0].r as { status: string; payment_id: number };
      assert.equal(out.status, "completed", "cash payment must complete");

      const order = await client.query(
        "SELECT payment_status, payment_method FROM public.orders WHERE id = $1",
        [orderId],
      );
      assert.equal(order.rows[0].payment_status, "paid");
      assert.equal(order.rows[0].payment_method, "cash");

      const payment = await client.query(
        "SELECT status, amount FROM public.payments WHERE id = $1",
        [out.payment_id],
      );
      assert.equal(payment.rows[0].status, "completed");
      assert.equal(Number(payment.rows[0].amount), total);

      // CRITICAL INVARIANT: a sale must not deduct stock in the HKD lean model.
      const movements = await countSaleStockMovements(client, orderId);
      assert.equal(
        movements,
        0,
        "a SALE must create NO stock_movements consumption row",
      );
    });
  },
);

test(
  "confirm_cash_payment is idempotent on a second call",
  { skip: RUN ? false : "uozwee creds absent" },
  async () => {
    await inRolledBackTx(async ({ actor, menuItemId }) => {
      const { orderId, total } = await createOrder(
        client,
        actor,
        menuItemId,
        1,
      );
      const first = await client.query(
        "SELECT public.confirm_cash_payment($1, $2) AS r",
        [orderId, total],
      );
      assert.equal(first.rows[0].r.status, "completed");

      const second = await client.query(
        "SELECT public.confirm_cash_payment($1, $2) AS r",
        [orderId, total],
      );
      assert.equal(
        second.rows[0].r.status,
        "already_completed",
        "second confirm must be idempotent",
      );
    });
  },
);

test(
  "confirm_cash_payment rejects underpayment",
  { skip: RUN ? false : "uozwee creds absent" },
  async () => {
    await inRolledBackTx(async ({ actor, menuItemId }) => {
      const { orderId, total } = await createOrder(
        client,
        actor,
        menuItemId,
        2,
      );
      await assert.rejects(
        client.query("SELECT public.confirm_cash_payment($1, $2) AS r", [
          orderId,
          total - 1,
        ]),
        /must be >=/,
      );
    });
  },
);

test(
  "confirm_vietqr_payment completes the sale and writes NO stock_movements",
  { skip: RUN ? false : "uozwee creds absent" },
  async () => {
    await inRolledBackTx(async ({ actor, menuItemId }) => {
      const { orderId, total } = await createOrder(
        client,
        actor,
        menuItemId,
        3,
      );

      const res = await client.query(
        "SELECT public.confirm_vietqr_payment($1, $2, $3, $4, $5::uuid) AS r",
        [TENANT_ID, BRANCH_ID, orderId, total, actor.uid],
      );
      const out = res.rows[0].r as { payment_id: number; idempotent: boolean };
      assert.ok(out.payment_id, "vietqr payment id returned");
      assert.equal(out.idempotent, false);

      const order = await client.query(
        "SELECT payment_status, payment_method FROM public.orders WHERE id = $1",
        [orderId],
      );
      assert.equal(order.rows[0].payment_status, "paid");
      assert.equal(order.rows[0].payment_method, "vietqr");

      const movements = await countSaleStockMovements(client, orderId);
      assert.equal(movements, 0, "VietQR sale must not deduct stock");
    });
  },
);

test(
  "create_refund records a pending refund against a completed payment",
  { skip: RUN ? false : "uozwee creds absent" },
  async () => {
    await inRolledBackTx(async ({ actor, menuItemId }) => {
      const { orderId, total } = await createOrder(
        client,
        actor,
        menuItemId,
        2,
      );
      const pay = await client.query(
        "SELECT public.confirm_cash_payment($1, $2) AS r",
        [orderId, total],
      );
      const paymentId = pay.rows[0].r.payment_id as number;

      const refund = await client.query(
        "SELECT public.create_refund($1, $2, $3) AS r",
        [paymentId, total, "khách trả món — integration test"],
      );
      const out = refund.rows[0].r as { status: string; refund_id: number };
      assert.equal(out.status, "created");
      assert.ok(out.refund_id);

      const row = await client.query(
        "SELECT status, amount, payment_id FROM public.refunds WHERE id = $1",
        [out.refund_id],
      );
      assert.equal(row.rows[0].status, "pending");
      assert.equal(Number(row.rows[0].amount), total);
      assert.equal(Number(row.rows[0].payment_id), paymentId);
    });
  },
);

test(
  "create_refund rejects a refund exceeding the payment amount",
  { skip: RUN ? false : "uozwee creds absent" },
  async () => {
    await inRolledBackTx(async ({ actor, menuItemId }) => {
      const { orderId, total } = await createOrder(
        client,
        actor,
        menuItemId,
        1,
      );
      const pay = await client.query(
        "SELECT public.confirm_cash_payment($1, $2) AS r",
        [orderId, total],
      );
      const paymentId = pay.rows[0].r.payment_id as number;

      await assert.rejects(
        client.query("SELECT public.create_refund($1, $2, $3) AS r", [
          paymentId,
          total + 1000,
          "over-refund",
        ]),
        /refund_exceeds_remaining/,
      );
    });
  },
);

test(
  "aggregate_daily_b2c_invoice runs and (when eligible orders exist) a draft can transition to signing",
  { skip: RUN ? false : "uozwee creds absent" },
  async () => {
    await inRolledBackTx(async ({ actor, menuItemId }) => {
      // Create + cash-pay an order today so it is eligible for the B2C summary.
      const { orderId, total } = await createOrder(
        client,
        actor,
        menuItemId,
        2,
      );
      await client.query("SELECT public.confirm_cash_payment($1, $2)", [
        orderId,
        total,
      ]);

      const today = new Date().toISOString().slice(0, 10);
      const agg = await client.query(
        "SELECT public.aggregate_daily_b2c_invoice($1, $2::date, $3::uuid) AS r",
        [BRANCH_ID, today, actor.uid],
      );
      const result = agg.rows[0].r as {
        skipped?: boolean;
        tax_invoice_id?: number;
      };

      // Either it produced a draft invoice, or it skipped (e.g. order already
      // folded / not eligible) — both are valid RPC outcomes. When a draft was
      // created, the state machine RPC must accept draft → signing.
      if (!result.skipped && result.tax_invoice_id) {
        // transition_tax_invoice_state_as_system is service-role only — in
        // production the daily-summary runner calls it with a service-role
        // client. Mirror that by switching the auth context to service_role for
        // this single call, then restore the authenticated owner context.
        await client.query(
          "SELECT set_config('request.jwt.claims', $1, true)",
          [JSON.stringify({ role: "service_role" })],
        );
        const trans = await client.query(
          `SELECT public.transition_tax_invoice_state_as_system(
              $1, 'signing', $2::uuid, '{"provider":"integration-test"}'::jsonb, NULL)`,
          [result.tax_invoice_id, actor.uid],
        );
        // RPC returns successfully (no exception) — the transition was legal.
        assert.ok(trans.rowCount === 1);
        await setAuthContext(client, actor);
        const inv = await client.query(
          "SELECT status FROM public.tax_invoices WHERE id = $1",
          [result.tax_invoice_id],
        );
        assert.equal(inv.rows[0].status, "signing");
      } else {
        assert.equal(result.skipped, true);
      }
    });
  },
);

test(
  "cash_entries INSERT + SELECT succeed under RLS for an authenticated owner",
  { skip: RUN ? false : "uozwee creds absent" },
  async () => {
    await inRolledBackTx(async ({ actor }) => {
      const today = new Date().toISOString().slice(0, 10);
      const ins = await client.query(
        `INSERT INTO public.cash_entries
           (tenant_id, branch_id, entry_date, direction, category, amount, note, created_by)
         VALUES ($1, $2, $3::date, 'out', 'mua_nguyen_lieu', 125000, 'integration test chi', $4::uuid)
         RETURNING id`,
        [actor.tenantId, actor.branchId, today, actor.uid],
      );
      const id = ins.rows[0].id as number;
      assert.ok(id);

      const sel = await client.query(
        "SELECT amount, direction FROM public.cash_entries WHERE id = $1",
        [id],
      );
      assert.equal(sel.rowCount, 1, "owner must read back the cash entry (RLS)");
      assert.equal(Number(sel.rows[0].amount), 125000);
      assert.equal(sel.rows[0].direction, "out");
    });
  },
);

test(
  "cash_entries INSERT is blocked by RLS for a foreign tenant",
  { skip: RUN ? false : "uozwee creds absent" },
  async () => {
    await inRolledBackTx(async ({ actor }) => {
      const today = new Date().toISOString().slice(0, 10);
      // tenant_id 999 != auth_tenant_id() (1) → WITH CHECK fails.
      await assert.rejects(
        client.query(
          `INSERT INTO public.cash_entries
             (tenant_id, branch_id, entry_date, direction, category, amount, created_by)
           VALUES (999, $1, $2::date, 'out', 'x', 1000, $3::uuid)`,
          [actor.branchId, today, actor.uid],
        ),
        /row-level security|violates|policy/i,
      );
    });
  },
);

// ── MoMo signed-IPN webhook verification (no DB; pure HMAC trust boundary) ──

const MOMO = {
  partnerCode: "MOMO_INT_PARTNER",
  accessKey: "MOMO_INT_ACCESS",
  secretKey: "MOMO_INT_SECRET",
};

/** Build the exact rawSignature string MoMoProvider.verifyWebhook expects. */
function signMomoIpn(payload: Record<string, unknown>): string {
  const raw = [
    `accessKey=${MOMO.accessKey}`,
    `amount=${payload.amount ?? ""}`,
    `extraData=${payload.extraData ?? ""}`,
    `message=${payload.message ?? ""}`,
    `orderId=${payload.orderId ?? ""}`,
    `orderInfo=${payload.orderInfo ?? ""}`,
    `orderType=${payload.orderType ?? ""}`,
    `partnerCode=${payload.partnerCode ?? ""}`,
    `payType=${payload.payType ?? ""}`,
    `requestId=${payload.requestId ?? ""}`,
    `responseTime=${payload.responseTime ?? ""}`,
    `resultCode=${payload.resultCode ?? ""}`,
    `transId=${payload.transId ?? ""}`,
  ].join("&");
  return createHmac("sha256", MOMO.secretKey).update(raw).digest("hex");
}

test("MoMo IPN: a correctly signed webhook verifies as valid", () => {
  const provider = new MoMoProvider(MOMO);
  const base = {
    partnerCode: MOMO.partnerCode,
    orderId: "MOMO-42-abcd1234",
    requestId: "req-1",
    amount: 100000,
    orderInfo: "Thanh toan don 42",
    orderType: "momo_wallet",
    transId: 999000111,
    resultCode: 0,
    message: "Successful.",
    payType: "qr",
    responseTime: 1717000000000,
    extraData: Buffer.from(
      JSON.stringify({ tenantId: 1, orderId: 42 }),
    ).toString("base64"),
  };
  const signature = signMomoIpn(base);
  const verified = provider.verifyWebhook(base, signature);
  assert.equal(verified.valid, true, "valid HMAC must verify");
});

test("MoMo IPN: a tampered amount fails signature verification", () => {
  const provider = new MoMoProvider(MOMO);
  const base = {
    partnerCode: MOMO.partnerCode,
    orderId: "MOMO-42-abcd1234",
    requestId: "req-1",
    amount: 100000,
    orderInfo: "Thanh toan don 42",
    orderType: "momo_wallet",
    transId: 999000111,
    resultCode: 0,
    message: "Successful.",
    payType: "qr",
    responseTime: 1717000000000,
    extraData: Buffer.from(
      JSON.stringify({ tenantId: 1, orderId: 42 }),
    ).toString("base64"),
  };
  const signature = signMomoIpn(base);
  // Attacker bumps the amount but keeps the original signature.
  const tampered = { ...base, amount: 1 };
  const verified = provider.verifyWebhook(tampered, signature);
  assert.equal(verified.valid, false, "tampered payload must be rejected");
});

test("MoMo IPN: an empty/garbage signature is rejected", () => {
  const provider = new MoMoProvider(MOMO);
  const base = {
    partnerCode: MOMO.partnerCode,
    orderId: "MOMO-1",
    requestId: "req-2",
    amount: 5000,
    resultCode: 0,
    responseTime: 1717000000000,
    extraData: "",
  };
  assert.equal(provider.verifyWebhook(base, "").valid, false);
  assert.equal(provider.verifyWebhook(base, "deadbeef").valid, false);
});
