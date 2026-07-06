import { test, expect } from "@playwright/test";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import {
  cleanupBranchMenuDailyLimit,
  getBranchMenuDailyLimitSoldToday,
  getPosTestContext,
  setBranchMenuDailyLimit,
} from "./helpers/supabase";

/**
 * E2E: daily-limit realtime broadcast (commit 168ca41 +
 * migration 20260517000000_branch_menu_daily_limits_realtime.sql).
 *
 * Regression boundary:
 *   1. branch_menu_item_daily_limits IS in supabase_realtime publication.
 *   2. REPLICA IDENTITY FULL is set so the broadcast carries enough data
 *      for the client filter `branch_id=eq.X` to match.
 *   3. Trigger UPDATE of sold_today fires a postgres_changes event that
 *      a subscribed client receives within 5s.
 *   4. The enforcement trigger raises when an INSERT would exceed the
 *      cap — second cashier cannot oversell a 1-portion-left limit.
 *
 * Scope: subscribes via service-role client (bypasses RLS to isolate the
 * publication-level test from RLS misconfigurations). RLS-correctness is
 * exercised separately by the live POS subscription path during normal
 * smoke runs.
 */
test.describe("Daily limit — realtime + enforcement", () => {
  test("UPDATE on branch_menu_item_daily_limits broadcasts to subscribers", async () => {
    const ctx = await getPosTestContext();
    await setBranchMenuDailyLimit({
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      menuItemId: ctx.menuItemId,
      limitQuantity: 5,
    });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Missing SUPABASE env vars for realtime test");
    }

    const subscriber = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let receivedPayload: Record<string, unknown> | null = null;
    let channel: RealtimeChannel | null = null;

    try {
      channel = subscriber.channel(`daily-limit-test-${ctx.branchId}`);
      const subscribed = new Promise<void>((resolve, reject) => {
        channel!
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "branch_menu_item_daily_limits",
              filter: `branch_id=eq.${ctx.branchId}`,
            },
            (payload) => {
              if (
                (payload.new as { menu_item_id?: number }).menu_item_id ===
                ctx.menuItemId
              ) {
                receivedPayload = payload.new as Record<string, unknown>;
              }
            },
          )
          .subscribe((status, err) => {
            if (status === "SUBSCRIBED") resolve();
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              reject(err ?? new Error(`Subscribe failed: ${status}`));
            }
          });
      });

      await subscribed;

      // Mutate sold_today directly to simulate trigger increment.
      const mutator = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      // Business date must match the server-side Asia/Ho_Chi_Minh keying used
      // by the daily-limit trigger and availability RPC — a UTC date drifts
      // one day past UTC-midnight on a UTC+7 machine and reads the wrong row.
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
      }).format(new Date());
      const { error: updateErr } = await mutator
        .from("branch_menu_item_daily_limits")
        .update({ sold_today: 3 })
        .eq("branch_id", ctx.branchId)
        .eq("menu_item_id", ctx.menuItemId)
        .eq("limit_date", today);

      if (updateErr) {
        throw new Error(`Failed to mutate sold_today: ${updateErr.message}`);
      }

      await expect
        .poll(() => receivedPayload, {
          timeout: 15_000,
          message:
            "subscriber must receive UPDATE event within 15s — verifies publication + REPLICA IDENTITY FULL chain (REALTIME-PUB-NEEDS-REPLICA-IDENTITY-FULL)",
        })
        .not.toBeNull();

      expect(
        (receivedPayload as { sold_today?: number } | null)?.sold_today,
      ).toBe(3);
      expect(
        (receivedPayload as { branch_id?: number } | null)?.branch_id,
      ).toBe(ctx.branchId);
    } finally {
      if (channel) {
        await subscriber.removeChannel(channel);
      }
      await cleanupBranchMenuDailyLimit({
        branchId: ctx.branchId,
        menuItemId: ctx.menuItemId,
      });
    }
  });

  test("enforcement trigger rejects INSERT that would exceed cap", async () => {
    const ctx = await getPosTestContext();
    await setBranchMenuDailyLimit({
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      menuItemId: ctx.menuItemId,
      limitQuantity: 2,
    });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Missing SUPABASE env vars");
    }

    const sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Manually create an order to attach order_items to (the enforcement
    // trigger fires on order_items INSERT). Cleanup happens in finally.
    const { data: order, error: orderErr } = await sb
      .from("orders")
      .insert({
        tenant_id: ctx.tenantId,
        branch_id: ctx.branchId,
        order_number: `LIMIT-E2E-${Date.now()}`,
        order_type: "takeaway",
        status: "confirmed",
        payment_status: "unpaid",
        subtotal: 0,
        tax_amount: 0,
        service_charge: 0,
        discount_amount: 0,
        total_amount: 0,
        created_by: ctx.cashier.userId,
        pos_session_id: ctx.posSessionId,
      })
      .select("id")
      .single();
    if (orderErr || !order) {
      throw new Error(`Failed to create test order: ${orderErr?.message}`);
    }

    try {
      // First insert under cap (qty=2) — succeeds.
      const { error: firstErr } = await sb.from("order_items").insert({
        tenant_id: ctx.tenantId,
        order_id: order.id,
        menu_item_id: ctx.menuItemId,
        item_name: ctx.menuItemName,
        quantity: 2,
        unit_price: ctx.unitPrice,
        modifiers: [],
        sides: [],
        subtotal: ctx.unitPrice * 2,
        status: "pending",
      });
      expect(firstErr).toBeNull();

      const sold = await getBranchMenuDailyLimitSoldToday({
        branchId: ctx.branchId,
        menuItemId: ctx.menuItemId,
      });
      expect(sold).toBe(2);

      // Second insert (qty=1) would push sold_today to 3 → trigger MUST
      // raise. Limit is 2.
      const { error: secondErr } = await sb.from("order_items").insert({
        tenant_id: ctx.tenantId,
        order_id: order.id,
        menu_item_id: ctx.menuItemId,
        item_name: ctx.menuItemName,
        quantity: 1,
        unit_price: ctx.unitPrice,
        modifiers: [],
        sides: [],
        subtotal: ctx.unitPrice,
        status: "pending",
      });
      expect(secondErr).not.toBeNull();
      expect(secondErr?.message ?? "").toMatch(/limit|hết suất|exceed/i);
    } finally {
      await sb.from("order_items").delete().eq("order_id", order.id);
      await sb.from("orders").delete().eq("id", order.id);
      await cleanupBranchMenuDailyLimit({
        branchId: ctx.branchId,
        menuItemId: ctx.menuItemId,
      });
    }
  });
});
